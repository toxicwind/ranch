"""Unit tests for ProcessWrapper class."""

import asyncio

import pytest

from mcp_background_job.models import JobStatus, ProcessOutput
from mcp_background_job.process import ProcessWrapper


class TestProcessWrapper:
    """Test cases for ProcessWrapper class."""

    def test_init(self):
        """Test ProcessWrapper initialization."""
        wrapper = ProcessWrapper("test-job-1", "echo hello", max_output_size=1024)

        assert wrapper.job_id == "test-job-1"
        assert wrapper.command == "echo hello"
        assert wrapper.max_output_size == 1024
        assert wrapper.process is None
        assert wrapper.started_at is None
        assert wrapper.completed_at is None
        assert len(wrapper.stdout_buffer) == 0
        assert len(wrapper.stderr_buffer) == 0

    @pytest.mark.asyncio
    async def test_start_simple_command(self):
        """Test starting a simple echo command."""
        wrapper = ProcessWrapper("test-job-1", "echo hello world")

        await wrapper.start()

        assert wrapper.process is not None
        assert wrapper.started_at is not None
        assert wrapper.get_pid() is not None

        # Wait for process to complete
        await asyncio.sleep(0.2)

        status = wrapper.get_status()
        assert status in [JobStatus.COMPLETED, JobStatus.RUNNING]

        # Clean up
        wrapper.cleanup()

    @pytest.mark.asyncio
    async def test_start_invalid_command(self):
        """Test starting an invalid command."""
        wrapper = ProcessWrapper("test-job-1", "nonexistent-command-xyz")

        with pytest.raises(Exception):
            await wrapper.start()

    @pytest.mark.asyncio
    async def test_get_output_simple(self):
        """Test getting output from a simple command."""
        wrapper = ProcessWrapper("test-job-1", "echo hello world")

        await wrapper.start()

        # Wait for process to complete and output to be captured
        await asyncio.sleep(0.2)

        output = wrapper.get_output()
        assert isinstance(output, ProcessOutput)
        assert "hello world" in output.stdout
        assert output.stderr == ""

        wrapper.cleanup()

    @pytest.mark.asyncio
    async def test_get_status_lifecycle(self):
        """Test status changes through process lifecycle."""
        wrapper = ProcessWrapper("test-job-1", "sleep 0.1")

        # Before start
        assert wrapper.get_status() == JobStatus.FAILED

        await wrapper.start()

        # While running
        status = wrapper.get_status()
        assert status in [
            JobStatus.RUNNING,
            JobStatus.COMPLETED,
        ]  # May complete very quickly

        # Wait for completion
        await asyncio.sleep(0.2)

        # After completion
        status = wrapper.get_status()
        assert status == JobStatus.COMPLETED
        assert wrapper.get_exit_code() == 0

        wrapper.cleanup()

    @pytest.mark.asyncio
    async def test_kill_process(self):
        """Test killing a running process."""
        wrapper = ProcessWrapper("test-job-1", "sleep 10")

        await wrapper.start()

        # Process should be running
        assert wrapper.get_status() == JobStatus.RUNNING

        # Kill the process
        killed = wrapper.kill()
        assert killed is True

        # Wait a moment for status to update
        await asyncio.sleep(0.1)

        # Process should be killed
        status = wrapper.get_status()
        assert status == JobStatus.KILLED

        # Trying to kill again should return False
        killed_again = wrapper.kill()
        assert killed_again is False

        wrapper.cleanup()

    @pytest.mark.asyncio
    async def test_tail_output(self):
        """Test tail functionality."""
        # Create a command that outputs multiple lines
        wrapper = ProcessWrapper(
            "test-job-1", "python -c \"for i in range(10): print(f'line {i}')\""
        )

        await wrapper.start()

        # Wait for process to complete
        await asyncio.sleep(0.2)

        # Test tail with different line counts
        tail_3 = wrapper.tail_output(3)
        lines = tail_3.stdout.split("\n") if tail_3.stdout else []
        non_empty_lines = [line for line in lines if line.strip()]

        # Should get the last 3 lines (or fewer if less than 3 lines total)
        assert len(non_empty_lines) <= 3
        if non_empty_lines:
            assert "line" in non_empty_lines[-1]

        wrapper.cleanup()

    @pytest.mark.asyncio
    async def test_send_input_interactive(self):
        """Test sending input to an interactive process."""
        # Use cat command which echoes input
        wrapper = ProcessWrapper("test-job-1", "cat")

        await wrapper.start()

        # Send input
        await wrapper.send_input("hello world")

        # Wait a bit for output
        await asyncio.sleep(0.1)

        # Get all output
        output = wrapper.get_output()

        # The output should contain our input (cat echoes it)
        assert "hello world" in output.stdout

        wrapper.cleanup()

    @pytest.mark.asyncio
    async def test_send_input_to_stopped_process(self):
        """Test sending input to a process that's not running."""
        wrapper = ProcessWrapper("test-job-1", "echo hello")

        # Don't start the process
        with pytest.raises(RuntimeError, match="is not running"):
            await wrapper.send_input("test")

    def test_buffer_size_management(self):
        """Test that buffers respect size limits."""
        # Create wrapper with small buffer size
        wrapper = ProcessWrapper("test-job-1", "echo hello", max_output_size=500)

        # Check that buffer max length is calculated correctly
        expected_max_lines = 500 // 100  # 5 lines
        assert wrapper.stdout_buffer.maxlen == expected_max_lines
        assert wrapper.stderr_buffer.maxlen == expected_max_lines

    @pytest.mark.asyncio
    async def test_cleanup(self):
        """Test process cleanup."""
        wrapper = ProcessWrapper("test-job-1", "sleep 10")

        await wrapper.start()
        wrapper.get_pid()

        # Process should be running
        assert wrapper.get_status() == JobStatus.RUNNING

        # Cleanup should kill the process
        wrapper.cleanup()

        # Wait a moment
        await asyncio.sleep(0.1)

        # Process should be terminated
        status = wrapper.get_status()
        assert status in [JobStatus.KILLED, JobStatus.FAILED]

    @pytest.mark.asyncio
    async def test_multiple_output_lines(self):
        """Test capturing multiple lines of output."""
        # Command that outputs multiple lines with delay
        wrapper = ProcessWrapper(
            "test-job-1",
            "python -c \"import time; [print(f'line {i}') or time.sleep(0.01) for i in range(5)]\"",
        )

        await wrapper.start()

        # Wait for process to complete
        await asyncio.sleep(0.5)

        output = wrapper.get_output()
        lines = [line for line in output.stdout.split("\n") if line.strip()]

        # Should have captured all 5 lines
        assert len(lines) >= 5
        assert "line 0" in output.stdout
        assert "line 4" in output.stdout

        wrapper.cleanup()

    @pytest.mark.asyncio
    async def test_stderr_capture(self):
        """Test capturing stderr output."""
        # Command that outputs to stderr
        wrapper = ProcessWrapper(
            "test-job-1",
            "python -c \"import sys; print('error message', file=sys.stderr)\"",
        )

        await wrapper.start()

        # Wait for process to complete
        await asyncio.sleep(0.2)

        output = wrapper.get_output()
        assert "error message" in output.stderr

        wrapper.cleanup()

    def test_command_parsing(self):
        """Test that commands are parsed safely."""
        # Test with command that has spaces
        wrapper = ProcessWrapper("test-job-1", "echo 'hello world'")
        assert wrapper.command == "echo 'hello world'"

        # Test with complex command
        wrapper2 = ProcessWrapper("test-job-2", "python -c \"print('test')\"")
        assert wrapper2.command == "python -c \"print('test')\""
