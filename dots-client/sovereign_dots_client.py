"""
sovereign_dots_client.py - Production Coercion Layer for Dots-3-Note
Neutralizes: Ghost outputs, list:string mismatches, 22s latency, and replay crashes.
"""

import json
from openai import OpenAI

class SovereignDotsClient:
    def __init__(self, api_key: str):
        self.client = OpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=api_key
        )
        self.model = "dots-studio/dots-3-note-preview:free"

    def execute_structured_step(self, session_id: str, messages: list, tools: list, forced_tool: str = None, require_parameters: bool = True) -> dict:
        # 1. Normalize prior messages: replace content=None with content=""
        normalized_messages = []
        for m in messages:
            msg = dict(m)
            if msg.get("role") == "assistant" and msg.get("content") is None:
                msg["content"] = ""
            normalized_messages.append(msg)

        # 2. Inject strict mode into all tool schemas
        strict_tools = []
        for t in tools:
            st = json.loads(json.dumps(t))
            if "function" in st:
                st["function"]["strict"] = True
                if "parameters" in st["function"]:
                    st["function"]["parameters"]["additionalProperties"] = False
            strict_tools.append(st)

        # 3. Construct sovereign payload
        # Note: OpenRouter returns 404 "no endpoints found" when custom stop sequences
        # and provider.require_parameters=True are combined; only send stop when
        # require_parameters is False.
        extra_body = {
            "sessionId": session_id,
            "max_tokens": 4096,
            "temperature": 0.1,
            "reasoning": {
                "max_tokens": 128,
                "exclude": True
            },
            "provider": {
                "require_parameters": require_parameters,
                "allow_fallbacks": False
            }
        }
        if not require_parameters:
            extra_body["stop"] = ["</tool_call>", "</dots_function_call>", "<|endoftext|>", "```"]

        tool_choice = {"type": "function", "function": {"name": forced_tool}} if forced_tool else "auto"

        response = self.client.chat.completions.create(
            model=self.model,
            messages=normalized_messages,
            tools=strict_tools,
            tool_choice=tool_choice,
            extra_body=extra_body
        )

        return response.choices[0].message
