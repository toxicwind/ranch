"""Unit tests for Pydantic data models."""

import pytest
from datetime import datetime, UTC
from uuid import uuid4

from mcp_background_job.models import (
    JobStatus,
    BackgroundJob,
    JobSummary,
    ProcessOutput,
    ExecuteInput,
    ExecuteOutput,
    TailInput,
    ListOutput,
)


class TestJobStatus:
    """Tests for JobStatus enum."""

    def test_job_status_values(self):
        """Test JobStatus enum values."""
        assert JobStatus.RUNNING == "running"
        assert JobStatus.COMPLETED == "completed"
        assert JobStatus.FAILED == "failed"
        assert JobStatus.KILLED == "killed"


class TestBackgroundJob:
    """Tests for BackgroundJob model."""

    def test_background_job_creation(self):
        """Test creating a BackgroundJob instance."""
        job_id = str(uuid4())
        started = datetime.now(UTC)

        job = BackgroundJob(
            job_id=job_id,
            command="echo 'hello'",
            status=JobStatus.RUNNING,
            started=started,
            pid=1234,
        )

        assert job.job_id == job_id
        assert job.command == "echo 'hello'"
        assert job.status == JobStatus.RUNNING
        assert job.started == started
        assert job.completed is None
        assert job.exit_code is None
        assert job.pid == 1234

    def test_background_job_completed(self):
        """Test BackgroundJob with completion data."""
        job_id = str(uuid4())
        started = datetime.now(UTC)
        completed = datetime.now(UTC)

        job = BackgroundJob(
            job_id=job_id,
            command="echo 'hello'",
            status=JobStatus.COMPLETED,
            started=started,
            completed=completed,
            exit_code=0,
            pid=1234,
        )

        assert job.status == JobStatus.COMPLETED
        assert job.completed == completed
        assert job.exit_code == 0


class TestProcessOutput:
    """Tests for ProcessOutput model."""

    def test_process_output_creation(self):
        """Test creating ProcessOutput instance."""
        output = ProcessOutput(stdout="Hello, world!", stderr="Warning: something")

        assert output.stdout == "Hello, world!"
        assert output.stderr == "Warning: something"


class TestToolModels:
    """Tests for tool input/output models."""

    def test_execute_input(self):
        """Test ExecuteInput model."""
        execute_input = ExecuteInput(command="echo 'test'")
        assert execute_input.command == "echo 'test'"

    def test_execute_output(self):
        """Test ExecuteOutput model."""
        job_id = str(uuid4())
        execute_output = ExecuteOutput(job_id=job_id)
        assert execute_output.job_id == job_id

    def test_tail_input_defaults(self):
        """Test TailInput model with defaults."""
        job_id = str(uuid4())
        tail_input = TailInput(job_id=job_id)
        assert tail_input.job_id == job_id
        assert tail_input.lines == 50

    def test_tail_input_custom_lines(self):
        """Test TailInput model with custom lines."""
        job_id = str(uuid4())
        tail_input = TailInput(job_id=job_id, lines=100)
        assert tail_input.lines == 100

    def test_tail_input_validation(self):
        """Test TailInput validation."""
        job_id = str(uuid4())

        # Should work with valid range
        TailInput(job_id=job_id, lines=1)
        TailInput(job_id=job_id, lines=1000)

        # Should fail outside range
        with pytest.raises(ValueError):
            TailInput(job_id=job_id, lines=0)

        with pytest.raises(ValueError):
            TailInput(job_id=job_id, lines=1001)

    def test_list_output(self):
        """Test ListOutput model."""
        job_summaries = [
            JobSummary(
                job_id=str(uuid4()),
                status=JobStatus.RUNNING,
                command="echo 'test1'",
                started=datetime.now(UTC),
            ),
            JobSummary(
                job_id=str(uuid4()),
                status=JobStatus.COMPLETED,
                command="echo 'test2'",
                started=datetime.now(UTC),
            ),
        ]

        list_output = ListOutput(jobs=job_summaries)
        assert len(list_output.jobs) == 2
        assert list_output.jobs[0].status == JobStatus.RUNNING
        assert list_output.jobs[1].status == JobStatus.COMPLETED
