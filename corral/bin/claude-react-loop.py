#!/usr/bin/env python3
"""ReAct loop for claude-shim: enables tool use via Gatehouse MCP.

The nim-shim-real binary is prompt->text only with no tool support.
This wrapper implements a ReAct (Reasoning + Acting) loop:
1. Prepend tool-use instructions to the prompt
2. Call the model via nim-shim-real
3. Parse for <tool_call> tags
4. Execute via Gatehouse CLI
5. Feed results back, repeat until done
"""
import json
import os
import re
import subprocess
import sys

GATEHOUSE_BIN = "/home/toxic/sovereign/projects/range/bin/gatehouse"
GATEHOUSE_CONFIG = "/home/toxic/sovereign/projects/range/ranch/barn/gatehouse/mcp_config.json"
NIM_SHIM_REAL = "/home/toxic/.local/bin/claude.nim-shim-real"
MAX_ITERATIONS = 10

TOOL_INSTRUCTIONS = """You have access to filesystem tools. To use a tool, output EXACTLY this format:

<tool_call>
{"server": "hashline", "tool": "write", "arguments": {"file": "/path/to/file", "content": "content here"}}
</tool_call>

Available tools:
- hashline:write - Create or overwrite a file. Args: file (string, required), content (string, required), force (boolean, optional)
- hashline:read - Read a file. Args: file (string, required)

CRITICAL RULES:
- When the task requires creating, writing, reading, or modifying ANY file, you MUST output the <tool_call> tag with valid JSON. Do NOT just describe what you would do.
- Output ONLY the <tool_call> tag when you need to use a tool, nothing else.
- After a tool executes, you will see the result. Then either call another tool or give your final answer.
- If the task does not require filesystem operations, answer directly without tool_call tags.
"""

def call_model(prompt):
    """Call nim-shim-real with the prompt, return output text."""
    result = subprocess.run(
        [NIM_SHIM_REAL, prompt],
        capture_output=True,
        text=True,
        timeout=120,
        env=os.environ.copy()
    )
    return result.stdout.strip()

def execute_tool(server, tool, arguments):
    """Execute a tool via Gatehouse CLI, return result string."""
    tool_name = f"{server}:{tool}"
    # Determine intent: read vs write
    if tool in ("write", "remove_file", "rename_file", "patch"):
        cmd = "tool-write"
    else:
        cmd = "tool-read"
    
    json_args = json.dumps(arguments)
    result = subprocess.run(
        [GATEHOUSE_BIN, "call", cmd, f"--tool-name={tool_name}",
         f"--json_args={json_args}", "-c", GATEHOUSE_CONFIG, "-o", "json"],
        capture_output=True,
        text=True,
        timeout=60
    )
    # Extract the actual result from the output
    output = result.stdout + result.stderr
    # Try to find JSON result
    return output[-2000:]  # Last 2000 chars to avoid huge outputs

def main():
    if len(sys.argv) < 2:
        print("Usage: claude-react-loop.py <prompt>", file=sys.stderr)
        sys.exit(1)
    
    user_prompt = sys.argv[1]
    full_prompt = TOOL_INSTRUCTIONS + "\n\nTask: " + user_prompt
    
    for iteration in range(MAX_ITERATIONS):
        output = call_model(full_prompt)
        
        # Check for tool call
        match = re.search(r"<tool_call>\s*(.*?)\s*</tool_call>", output, re.DOTALL)
        if not match:
            # No tool call, this is the final answer
            print(output)
            return
        
        try:
            tool_call = json.loads(match.group(1))
            server = tool_call["server"]
            tool = tool_call["tool"]
            arguments = tool_call["arguments"]
        except (json.JSONDecodeError, KeyError) as e:
            print(f"Tool call parse error: {e}\nOutput was: {output}")
            return
        
        # Execute the tool
        result = execute_tool(server, tool, arguments)
        
        # Append to prompt for next iteration
        full_prompt += f"\n\nTool call executed: {server}:{tool}\nResult: {result}\n\nContinue with the task. If done, provide your final answer without tool_call tags."
    
    print("Max iterations reached without completion.")

if __name__ == "__main__":
    main()
