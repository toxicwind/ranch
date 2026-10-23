"""Entry point for MCP Background Job Server."""


def main():
    """Entry point for the MCP Background Job Server."""
    from .server import main as server_main

    server_main()


if __name__ == "__main__":
    main()
