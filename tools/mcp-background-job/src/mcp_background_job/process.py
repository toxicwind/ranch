"""Process management layer for background jobs."""

import asyncio
import logging
import shlex
import subprocess
import threading
from collections import deque
from datetime import datetime, timezone
from typing import Deque, Optional

from .models import JobStatus, ProcessOutput

logger = logging.getLogger(__name__)


class ProcessWrapper:
    """Wrapper for managing background processes with I/O handling."""

    def __init__(
        self, job_id: str, command: str, max_output_size: int = 10 * 1024 * 1024
    ):
        """Initialize process wrapper.

        Args:
            job_id: Unique identifier for the job
            command: Shell command to execute
            max_output_size: Maximum size for output buffers in bytes
        """
        self.job_id = job_id
        self.command = command
        self.max_output_size = max_output_size
        self.process: Optional[subprocess.Popen] = None
        self.started_at: Optional[datetime] = None
        self.completed_at: Optional[datetime] = None

        # Ring buffers for stdout/stderr using deque with maxlen
        # Each line is stored separately to support tail functionality
        max_lines = max_output_size // 100  # Rough estimate: 100 bytes per line average
        self.stdout_buffer: Deque[str] = deque(maxlen=max_lines)
        self.stderr_buffer: Deque[str] = deque(maxlen=max_lines)

        # Threads for reading process output
        self._stdout_thread: Optional[threading.Thread] = None
        self._stderr_thread: Optional[threading.Thread] = None
        self._output_complete = threading.Event()

        # Lock for thread-safe buffer access
        self._buffer_lock = threading.Lock()

    async def start(self) -> None:
        """Start the process with proper I/O handling."""
        if self.process is not None:
            raise RuntimeError(f"Process {self.job_id} is already running")

        try:
            # Parse command safely to avoid shell injection
            # Use shell=True but with shlex.split for safer parsing
            args = shlex.split(self.command)

            logger.info(f"Starting process {self.job_id}: {self.command}")

            # Start process with pipes for I/O
            self.process = subprocess.Popen(
                args,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                stdin=subprocess.PIPE,
                text=True,
                bufsize=1,  # Line buffered
                universal_newlines=True,
            )

            self.started_at = datetime.now(timezone.utc)

            # Start threads to read stdout and stderr
            self._start_output_threads()

            logger.info(f"Process {self.job_id} started with PID {self.process.pid}")

        except Exception as e:
            logger.error(f"Failed to start process {self.job_id}: {e}")
            self.process = None
            raise

    def _start_output_threads(self) -> None:
        """Start threads to read process stdout and stderr."""
        if self.process is None:
            return

        self._output_complete.clear()

        # Thread for reading stdout
        self._stdout_thread = threading.Thread(
            target=self._read_stream,
            args=(self.process.stdout, self.stdout_buffer, "stdout"),
            daemon=True,
        )
        self._stdout_thread.start()

        # Thread for reading stderr
        self._stderr_thread = threading.Thread(
            target=self._read_stream,
            args=(self.process.stderr, self.stderr_buffer, "stderr"),
            daemon=True,
        )
        self._stderr_thread.start()

    def _read_stream(self, stream, buffer: Deque[str], stream_name: str) -> None:
        """Read from a process stream and buffer the output.

        Args:
            stream: Process stream (stdout or stderr)
            buffer: Deque buffer to store lines
            stream_name: Name of stream for logging
        """
        try:
            while True:
                line = stream.readline()
                if not line:  # EOF
                    break

                # Remove trailing newline but preserve other whitespace
                line = line.rstrip("\n\r")

                with self._buffer_lock:
                    buffer.append(line)

                logger.debug(f"Process {self.job_id} {stream_name}: {line}")

        except Exception as e:
            logger.error(f"Error reading {stream_name} for process {self.job_id}: {e}")
        finally:
            # Signal that this stream is complete
            logger.debug(f"Finished reading {stream_name} for process {self.job_id}")

    async def send_input(self, text: str) -> ProcessOutput:
        """Send input to process stdin and return immediate output.

        Args:
            text: Text to send to stdin

        Returns:
            ProcessOutput with any immediate stdout/stderr output

        Raises:
            RuntimeError: If process is not running or stdin is not available
        """
        if self.process is None:
            raise RuntimeError(f"Process {self.job_id} is not running")

        if self.process.stdin is None:
            raise RuntimeError(f"Process {self.job_id} stdin is not available")

        try:
            # Record output lines before sending input
            with self._buffer_lock:
                stdout_before = len(self.stdout_buffer)
                stderr_before = len(self.stderr_buffer)

            # Send input to process
            self.process.stdin.write(text)
            if not text.endswith("\n"):
                self.process.stdin.write("\n")
            self.process.stdin.flush()

            logger.debug(f"Sent input to process {self.job_id}: {text.strip()}")

            # Wait a brief moment for any immediate output
            await asyncio.sleep(0.1)

            # Collect any new output
            with self._buffer_lock:
                stdout_new = list(self.stdout_buffer)[stdout_before:]
                stderr_new = list(self.stderr_buffer)[stderr_before:]

            return ProcessOutput(
                stdout="\n".join(stdout_new), stderr="\n".join(stderr_new)
            )

        except Exception as e:
            logger.error(f"Error sending input to process {self.job_id}: {e}")
            raise

    def get_status(self) -> JobStatus:
        """Get current process status.

        Returns:
            Current job status
        """
        if self.process is None:
            return JobStatus.FAILED

        # Check if process is still running
        exit_code = self.process.poll()

        if exit_code is None:
            return JobStatus.RUNNING
        elif exit_code == 0:
            if self.completed_at is None:
                self.completed_at = datetime.now(timezone.utc)
            return JobStatus.COMPLETED
        elif exit_code == -9 or exit_code == -15:  # SIGKILL or SIGTERM
            if self.completed_at is None:
                self.completed_at = datetime.now(timezone.utc)
            return JobStatus.KILLED
        else:
            if self.completed_at is None:
                self.completed_at = datetime.now(timezone.utc)
            return JobStatus.FAILED

    def kill(self) -> bool:
        """Kill the process.

        Returns:
            True if process was killed, False if already terminated
        """
        if self.process is None:
            return False

        # Check if already terminated
        if self.process.poll() is not None:
            return False

        try:
            logger.info(f"Killing process {self.job_id} (PID: {self.process.pid})")

            # Try graceful termination first
            self.process.terminate()

            # Wait up to 5 seconds for graceful termination
            try:
                self.process.wait(timeout=5)
                logger.info(f"Process {self.job_id} terminated gracefully")
            except subprocess.TimeoutExpired:
                # Force kill if graceful termination fails
                logger.warning(
                    f"Process {self.job_id} did not terminate gracefully, force killing"
                )
                self.process.kill()
                self.process.wait()

            self.completed_at = datetime.now(timezone.utc)
            return True

        except Exception as e:
            logger.error(f"Error killing process {self.job_id}: {e}")
            return False

    def get_output(self) -> ProcessOutput:
        """Get all captured output.

        Returns:
            ProcessOutput containing all stdout and stderr
        """
        with self._buffer_lock:
            stdout_lines = list(self.stdout_buffer)
            stderr_lines = list(self.stderr_buffer)

        return ProcessOutput(
            stdout="\n".join(stdout_lines), stderr="\n".join(stderr_lines)
        )

    def tail_output(self, lines: int) -> ProcessOutput:
        """Get last N lines of output.

        Args:
            lines: Number of lines to return from the end

        Returns:
            ProcessOutput containing last N lines of stdout and stderr
        """
        with self._buffer_lock:
            # Get last N lines from each buffer
            stdout_lines = list(self.stdout_buffer)[-lines:] if lines > 0 else []
            stderr_lines = list(self.stderr_buffer)[-lines:] if lines > 0 else []

        return ProcessOutput(
            stdout="\n".join(stdout_lines), stderr="\n".join(stderr_lines)
        )

    def get_exit_code(self) -> Optional[int]:
        """Get process exit code if available.

        Returns:
            Exit code if process has terminated, None if still running
        """
        if self.process is None:
            return None
        return self.process.poll()

    def get_pid(self) -> Optional[int]:
        """Get process ID if available.

        Returns:
            Process ID if process is running, None otherwise
        """
        if self.process is None:
            return None
        return self.process.pid

    def cleanup(self) -> None:
        """Clean up process resources."""
        # Kill process if still running
        if self.process and self.process.poll() is None:
            self.kill()

        # Wait for output threads to complete
        if self._stdout_thread and self._stdout_thread.is_alive():
            self._stdout_thread.join(timeout=1)
        if self._stderr_thread and self._stderr_thread.is_alive():
            self._stderr_thread.join(timeout=1)

        # Close process streams
        if self.process:
            if self.process.stdin:
                self.process.stdin.close()
            if self.process.stdout:
                self.process.stdout.close()
            if self.process.stderr:
                self.process.stderr.close()

        logger.debug(f"Cleaned up process {self.job_id}")

    def __del__(self):
        """Destructor to ensure cleanup."""
        try:
            self.cleanup()
        except Exception:
            pass  # Ignore errors during cleanup in destructor
