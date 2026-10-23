# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an MCP (Model Context Protocol) server that enables coding agents to execute long-running shell commands asynchronously. The server provides process management capabilities including starting, monitoring, controlling, and interacting with background processes.

## Development Commands

This is a Python project using the `uv` package manager:

- `uv sync` - Sync project dependencies and create virtual environment
- `uvx pytest tests/` - Run all tests
- `uvx pytest tests/unit/ -v` - Run unit tests with verbose output
- `uvx pytest tests/integration/ -v` - Run integration tests with verbose output
- `uvx ruff format` - Format code before committing
- `uv run python -m mcp_background_job` - Run the MCP server (when implemented)

## Architecture Overview

The server implements the following core components:

### Service Layer
- **JobManager**: Central service managing background processes and job registry
- **ProcessWrapper**: Abstraction layer for child processes with I/O handling
- **BackgroundJobConfig**: Configuration management with environment variable support

### Data Models (Pydantic)
- **BackgroundJob**: Complete job information with status, timestamps, and process details
- **JobSummary**: Minimal job information for listing operations
- **ProcessOutput**: Structured stdout/stderr output
- **Tool Input/Output Models**: Validation for all MCP tool parameters

### MCP Tools
The server exposes 7 tools through the Model Context Protocol:

**Read-only tools:**
- `list`: Show all background jobs with status
- `status`: Get status of specific job 
- `output`: Get complete stdout/stderr of job
- `tail`: Get last N lines of job output

**Interactive tools:**
- `execute`: Start new background job, returns job_id
- `interact`: Send input to job's stdin
- `kill`: Terminate running job

## Key Design Patterns

### Process Management
- Uses subprocess with proper I/O handling and buffering
- Ring buffer implementation for stdout/stderr (max 10MB per job)
- UUID-based job identification
- Automatic cleanup of terminated processes

### Security & Resource Management
- Command validation and sanitization to prevent shell injection
- Configurable job limits and resource constraints
- Process timeout handling and graceful termination
- Memory usage monitoring and cleanup

### Error Handling
- Custom exception classes: JobNotFoundError, JobAlreadyTerminatedError, ProcessExecutionError
- Structured error responses through MCP ToolError
- Comprehensive input validation with Pydantic

## Configuration

The server supports configuration through:

**Environment Variables:**
- `MCP_BG_MAX_JOBS`: Maximum concurrent jobs (default: 10)
- `MCP_BG_MAX_OUTPUT_SIZE`: Maximum output buffer per job (default: 10MB)
- `MCP_BG_JOB_TIMEOUT`: Default job timeout in seconds
- `MCP_BG_CLEANUP_INTERVAL`: Cleanup interval in seconds (default: 300)

## Testing Strategy

The project implements comprehensive testing:

**Unit Tests**: Core functionality of JobManager, ProcessWrapper, and data models
**Integration Tests**: End-to-end workflows, concurrent job handling, long-running processes
**Test Commands**: Safe commands for testing (echo, sleep, python scripts)

## Implementation Status

This is currently a specification-only project. The actual implementation follows the detailed technical specification in SPEC.md and the implementation roadmap in TODO.md.

## Transport Support

Designed to support:
- **stdio**: Primary transport for local development (must log to stderr only)
- **HTTP**: For remote access with proper CORS and Origin header validation
- Binding to localhost (127.0.0.1) for security, not all interfaces (0.0.0.0)

## Claude Code Guidelines

- Do not use emojis
- Always commit changes after all tests have passed. Write a concise message that includes a list of all changes. Do not credit claude in commit messages.