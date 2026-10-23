"""Tests for MCP server startup and configuration."""

import pytest
from unittest.mock import MagicMock

from mcp_background_job.server import get_job_manager, cleanup_on_shutdown
from mcp_background_job.service import JobManager


class TestServerStartup:
    """Test server startup and configuration."""

    def test_get_job_manager_singleton(self):
        """Test that get_job_manager creates and returns singleton."""
        # Reset global manager
        import mcp_background_job.server

        mcp_background_job.server._job_manager = None

        # First call should create instance
        manager1 = get_job_manager()
        assert isinstance(manager1, JobManager)

        # Second call should return same instance
        manager2 = get_job_manager()
        assert manager1 is manager2

    @pytest.mark.asyncio
    async def test_cleanup_on_shutdown(self):
        """Test cleanup function."""
        # Create a mock job manager with async shutdown
        mock_manager = MagicMock()

        # Make shutdown an async mock
        async def mock_shutdown():
            pass

        mock_manager.shutdown = mock_shutdown

        # Set the global manager
        import mcp_background_job.server

        mcp_background_job.server._job_manager = mock_manager

        # Call cleanup - should not raise error
        await cleanup_on_shutdown()

    @pytest.mark.asyncio
    async def test_cleanup_on_shutdown_no_manager(self):
        """Test cleanup when no manager exists."""
        # Reset global manager
        import mcp_background_job.server

        mcp_background_job.server._job_manager = None

        # Should not raise error
        await cleanup_on_shutdown()

    def test_server_functions_exist(self):
        """Test that all required functions are defined in the server module."""
        import mcp_background_job.server as server_module

        expected_functions = [
            "list_jobs",
            "get_job_status",
            "get_job_output",
            "tail_job_output",
            "execute_command",
            "interact_with_job",
            "kill_job",
        ]

        for func_name in expected_functions:
            assert hasattr(server_module, func_name), (
                f"Function {func_name} not found in server module"
            )
            # Functions are wrapped by FastMCP decorators, so just check they exist

    def test_server_module_imports(self):
        """Test that the server module imports correctly."""
        try:
            import mcp_background_job.server

            assert hasattr(mcp_background_job.server, "mcp")
            assert hasattr(mcp_background_job.server, "get_job_manager")
            assert hasattr(mcp_background_job.server, "cleanup_on_shutdown")
            assert hasattr(mcp_background_job.server, "main")
        except ImportError as e:
            pytest.fail(f"Failed to import server module: {e}")
