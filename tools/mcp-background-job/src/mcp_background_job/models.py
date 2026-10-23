"""Pydantic data models for MCP Background Job Server."""

from datetime import datetime
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field


class JobStatus(str, Enum):
    """Status of a background job."""

    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    KILLED = "killed"


class BackgroundJob(BaseModel):
    """Complete background job information."""

    job_id: str = Field(..., description="UUID v4 job identifier")
    command: str = Field(..., description="Shell command being executed")
    status: JobStatus = Field(..., description="Current job status")
    started: datetime = Field(..., description="UTC timestamp when job started")
    completed: Optional[datetime] = Field(
        None, description="UTC timestamp when job completed"
    )
    exit_code: Optional[int] = Field(None, description="Process exit code")
    pid: Optional[int] = Field(None, description="Process ID")


class JobSummary(BaseModel):
    """Minimal job information for listing operations."""

    job_id: str = Field(..., description="UUID v4 job identifier")
    status: JobStatus = Field(..., description="Current job status")
    command: str = Field(..., description="Shell command being executed")
    started: datetime = Field(..., description="UTC timestamp when job started")


class ProcessOutput(BaseModel):
    """Structured stdout/stderr output from a process."""

    stdout: str = Field(..., description="Standard output content")
    stderr: str = Field(..., description="Standard error content")


class JobInteractionResult(BaseModel):
    """Result from interacting with a job's stdin."""

    stdout: str = Field(..., description="Standard output content")
    stderr: str = Field(..., description="Standard error content")


# Tool Input/Output Models


class ExecuteInput(BaseModel):
    """Input for execute tool."""

    command: str = Field(..., description="Shell command to execute")


class ExecuteOutput(BaseModel):
    """Output from execute tool."""

    job_id: str = Field(..., description="UUID v4 job identifier")


class TailInput(BaseModel):
    """Input for tail tool."""

    job_id: str = Field(..., description="Job ID to tail")
    lines: int = Field(50, description="Number of lines to return", ge=1, le=1000)


class StatusInput(BaseModel):
    """Input for status tool."""

    job_id: str = Field(..., description="Job ID to check")


class StatusOutput(BaseModel):
    """Output from status tool."""

    status: JobStatus = Field(..., description="Current job status")


class KillInput(BaseModel):
    """Input for kill tool."""

    job_id: str = Field(..., description="Job ID to kill")


class KillOutput(BaseModel):
    """Output from kill tool."""

    status: str = Field(
        ..., description="Kill result: 'killed', 'already_terminated', or 'not_found'"
    )


class OutputInput(BaseModel):
    """Input for output tool."""

    job_id: str = Field(..., description="Job ID to get output from")


class InteractInput(BaseModel):
    """Input for interact tool."""

    job_id: str = Field(..., description="Job ID to interact with")
    input: str = Field(..., description="Input to send to the job's stdin")


class ListOutput(BaseModel):
    """Output from list tool."""

    jobs: List[JobSummary] = Field(..., description="List of all background jobs")
