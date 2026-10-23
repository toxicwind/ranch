"""Logging configuration for MCP Background Job Server.

This module sets up structured logging to stderr for stdio transport compatibility.
For MCP servers using stdio transport, all logging must go to stderr to avoid
interfering with the protocol communication on stdout.
"""

import logging
import sys
from typing import Optional


def setup_logging(level: str = "INFO", format_string: Optional[str] = None) -> None:
    """Set up logging configuration for the MCP server.

    Args:
        level: Log level (DEBUG, INFO, WARNING, ERROR, CRITICAL)
        format_string: Custom format string for log messages
    """
    if format_string is None:
        format_string = (
            "%(asctime)s - %(name)s - %(levelname)s - "
            "%(filename)s:%(lineno)d - %(message)s"
        )

    # Remove any existing handlers to avoid duplicate logs
    root_logger = logging.getLogger()
    for handler in root_logger.handlers[:]:
        root_logger.removeHandler(handler)

    # Set up stderr handler for stdio transport compatibility
    handler = logging.StreamHandler(sys.stderr)
    handler.setFormatter(logging.Formatter(format_string))

    # Configure root logger
    logging.basicConfig(
        level=getattr(logging, level.upper()), handlers=[handler], force=True
    )

    # Set specific logger for this package
    logger = logging.getLogger("mcp_background_job")
    logger.setLevel(getattr(logging, level.upper()))


def get_logger(name: str) -> logging.Logger:
    """Get a logger instance for the given name.

    Args:
        name: Logger name, typically __name__

    Returns:
        Logger instance
    """
    return logging.getLogger(f"mcp_background_job.{name}")
