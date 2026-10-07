# MCP Background Job Server - Technical Specification

## Overview

The MCP Background Job Server enables coding agents to execute long-running shell commands asynchronously. This server provides process management capabilities through the Model Context Protocol, allowing clients to start, monitor, control, and interact with background processes.

## Architecture

### Core Components

1. **Job Manager Service** - Central service for managing background processes
2. **Process Wrapper** - Abstraction layer for child processes with I/O handling
3. **MCP Server** - FastMCP server exposing tools to clients
4. **Storage Layer** - In-memory job registry with optional persistence

### Technology Stack

- **Runtime**: Node.js / Python (recommend Python for consistency with repo)
- **MCP Framework**: FastMCP (Python)
- **Process Management**: subprocess (Python) or child_process (Node.js)
- **Data Validation**: Pydantic (Python) or Zod (Node.js)
- **Testing**: pytest + testcontainers (Python) or Jest (Node.js)

## Data Models

### Job Model

```python
from pydantic import BaseModel
from datetime import datetime
from enum import Enum
from typing import Optional, List

class JobStatus(str, Enum):
    RUNNING = "running"
    COMPLETED = "completed" 
    FAILED = "failed"
    KILLED = "killed"

class BackgroundJob(BaseModel):
    job_id: str  # UUID v4
    command: str
    status: JobStatus
    started: datetime  # UTC timestamp
    completed: Optional[datetime] = None
    exit_code: Optional[int] = None
    pid: Optional[int] = None
    
class JobSummary(BaseModel):
    job_id: str
    status: JobStatus
    command: str
    started: datetime

class ProcessOutput(BaseModel):
    stdout: str
    stderr: str

class JobInteractionResult(BaseModel):
    stdout: str
    stderr: str
```

### Tool Input/Output Models

```python
class ExecuteInput(BaseModel):
    command: str

class ExecuteOutput(BaseModel):
    job_id: str

class TailInput(BaseModel):
    job_id: str
    lines: int = 50  # Default to last 50 lines

class StatusInput(BaseModel):
    job_id: str

class StatusOutput(BaseModel):
    status: JobStatus

class KillInput(BaseModel):
    job_id: str

class KillOutput(BaseModel):
    status: str  # "killed", "already_terminated", "not_found"

class OutputInput(BaseModel):
    job_id: str

class InteractInput(BaseModel):
    job_id: str
    input: str

class ListOutput(BaseModel):
    jobs: List[JobSummary]
```

## Service Architecture

### JobManager Class

```python
class JobManager:
    def __init__(self):
        self._jobs: Dict[str, BackgroundJob] = {}
        self._processes: Dict[str, subprocess.Popen] = {}
        self._output_buffers: Dict[str, Dict[str, List[str]]] = {}
        
    async def execute_command(self, command: str) -> str:
        """Execute command as background job, return job_id"""
        
    async def get_job_status(self, job_id: str) -> JobStatus:
        """Get current status of job"""
        
    async def kill_job(self, job_id: str) -> str:
        """Kill running job"""
        
    async def get_job_output(self, job_id: str) -> ProcessOutput:
        """Get full stdout/stderr output"""
        
    async def tail_job_output(self, job_id: str, lines: int) -> ProcessOutput:
        """Get last N lines of output"""
        
    async def interact_with_job(self, job_id: str, input_text: str) -> ProcessOutput:
        """Send input to job stdin, return immediate output"""
        
    async def list_jobs(self) -> List[JobSummary]:
        """List all jobs"""
        
    def _cleanup_completed_jobs(self):
        """Clean up terminated processes"""
```

### Process Wrapper

```python
class ProcessWrapper:
    def __init__(self, job_id: str, command: str):
        self.job_id = job_id
        self.command = command
        self.process: Optional[subprocess.Popen] = None
        self.stdout_buffer: List[str] = []
        self.stderr_buffer: List[str] = []
        
    async def start(self):
        """Start the process with proper I/O handling"""
        
    async def send_input(self, text: str) -> ProcessOutput:
        """Send input to process stdin"""
        
    def get_status(self) -> JobStatus:
        """Get current process status"""
        
    def kill(self) -> bool:
        """Kill the process"""
        
    def get_output(self) -> ProcessOutput:
        """Get all captured output"""
        
    def tail_output(self, lines: int) -> ProcessOutput:
        """Get last N lines of output"""
```

## MCP Tool Definitions

### 1. execute

**Purpose**: Start a new background job
**Annotations**: 
- `readOnlyHint: false`
- `destructiveHint: false` 
- `idempotentHint: false`

```python
@mcp.tool()
async def execute(command: str = Field(..., description="Shell command to execute")) -> ExecuteOutput:
    """Execute a command as a background job and return job ID."""
```

### 2. list

**Purpose**: List all background jobs
**Annotations**:
- `readOnlyHint: true`
- `destructiveHint: false`
- `idempotentHint: true`

```python
@mcp.tool()
async def list() -> ListOutput:
    """List all background jobs with their status."""
```

### 3. status

**Purpose**: Get status of specific job
**Annotations**:
- `readOnlyHint: true`
- `destructiveHint: false`
- `idempotentHint: true`

```python
@mcp.tool()
async def status(job_id: str = Field(..., description="Job ID to check")) -> StatusOutput:
    """Get the current status of a background job."""
```

### 4. output

**Purpose**: Get full output of a job
**Annotations**:
- `readOnlyHint: true`
- `destructiveHint: false`
- `idempotentHint: true`

```python
@mcp.tool()
async def output(job_id: str = Field(..., description="Job ID to get output from")) -> ProcessOutput:
    """Get the complete stdout and stderr output of a job."""
```

### 5. tail

**Purpose**: Get recent output lines from a job
**Annotations**:
- `readOnlyHint: true`
- `destructiveHint: false`
- `idempotentHint: true`

```python
@mcp.tool()
async def tail(
    job_id: str = Field(..., description="Job ID to tail"),
    lines: int = Field(50, description="Number of lines to return", ge=1, le=1000)
) -> ProcessOutput:
    """Get the last N lines of stdout and stderr from a job."""
```

### 6. kill

**Purpose**: Terminate a running job
**Annotations**:
- `readOnlyHint: false`
- `destructiveHint: true`
- `idempotentHint: false`

```python
@mcp.tool()
async def kill(job_id: str = Field(..., description="Job ID to kill")) -> KillOutput:
    """Kill a running background job."""
```

### 7. interact

**Purpose**: Send input to a job and get response
**Annotations**:
- `readOnlyHint: false`
- `destructiveHint: false`
- `idempotentHint: false`

```python
@mcp.tool()
async def interact(
    job_id: str = Field(..., description="Job ID to interact with"),
    input: str = Field(..., description="Input to send to the job's stdin")
) -> ProcessOutput:
    """Send input to a job's stdin and return any immediate output."""
```

## Error Handling

### Error Types

1. **JobNotFoundError** - When job_id doesn't exist
2. **JobAlreadyTerminatedError** - When trying to interact with completed job
3. **ProcessExecutionError** - When command fails to start
4. **InvalidCommandError** - When command is malformed or forbidden

### Error Responses

All tools should return structured error information:

```python
from fastmcp.exceptions import ToolError

# Example error handling
if job_id not in self._jobs:
    raise ToolError(f"Job {job_id} not found")
```

## Security Considerations

### Command Restrictions

1. **Allowlist approach**: Define allowed commands/patterns
2. **Path restrictions**: Restrict execution to specific directories
3. **Environment isolation**: Clean environment variables
4. **Resource limits**: CPU/memory/time limits per process

### Input Validation

1. **Command sanitization**: Prevent shell injection
2. **Job ID validation**: Ensure proper UUID format
3. **Input length limits**: Prevent buffer overflow attacks

### Output Safety

1. **Output size limits**: Prevent memory exhaustion
2. **Sensitive data filtering**: Remove potential secrets from logs

## Performance Considerations

### Scalability

1. **Job limit**: Maximum concurrent jobs (default: 10)
2. **Output buffering**: Ring buffer for stdout/stderr (max 10MB per job)
3. **Cleanup strategy**: Automatic cleanup of old completed jobs
4. **Memory management**: Periodic cleanup of terminated processes

### Resource Management

1. **Process monitoring**: Track CPU/memory usage
2. **Timeout handling**: Optional job timeouts
3. **Graceful shutdown**: Clean termination of all jobs on server shutdown

## Testing Strategy

### Unit Tests

1. **JobManager tests**: Core job management functionality
2. **ProcessWrapper tests**: Process lifecycle management
3. **Tool tests**: MCP tool input/output validation
4. **Error handling tests**: Edge cases and error conditions

### Integration Tests

1. **End-to-end workflow**: Execute → monitor → interact → kill
2. **Concurrent job handling**: Multiple simultaneous jobs
3. **Long-running process tests**: Jobs that run for extended periods
4. **Resource cleanup tests**: Memory and process cleanup verification

### Test Tools and Commands

```python
# Example test commands
SAFE_TEST_COMMANDS = [
    "echo 'hello world'",
    "sleep 5",
    "python -c 'import time; time.sleep(2); print(\"done\")'",
    "ls -la",
    "pwd"
]

# Interactive test commands
INTERACTIVE_TEST_COMMANDS = [
    "python -i",  # Python REPL
    "node",       # Node.js REPL
    "cat"         # Read from stdin
]
```

## Configuration

### Environment Variables

```bash
MCP_BG_MAX_JOBS=10           # Maximum concurrent jobs
MCP_BG_MAX_OUTPUT_SIZE=10MB  # Maximum output buffer per job
MCP_BG_JOB_TIMEOUT=3600      # Default job timeout in seconds
MCP_BG_CLEANUP_INTERVAL=300  # Cleanup interval in seconds
MCP_BG_ALLOWED_COMMANDS=""   # Comma-separated allowed command patterns
```

### Configuration File Support

```python
class BackgroundJobConfig(BaseModel):
    max_concurrent_jobs: int = 10
    max_output_size_bytes: int = 10 * 1024 * 1024  # 10MB
    default_job_timeout: Optional[int] = None
    cleanup_interval_seconds: int = 300
    allowed_command_patterns: List[str] = []
    working_directory: str = "."
```

## Deployment Considerations

### Transport Support

- **stdio**: Primary transport for local development
- **HTTP**: For remote access with proper CORS handling
- **SSE**: For real-time updates (future enhancement)

### Logging Strategy

- Use structured logging to stderr
- Include job_id in all log entries
- Log process start/stop events
- Log resource usage periodically

### Monitoring

- Process count metrics
- Memory usage metrics
- Job completion rates
- Error rates by command type