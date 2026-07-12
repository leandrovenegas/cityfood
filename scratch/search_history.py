import os
import json

brain_dir = r"C:\Users\rayan\Documents\GitHub" # wait, logs are in AppData
brain_dir = r"C:\Users\rayan\.gemini\antigravity\brain"

if os.path.exists(brain_dir):
    for conv_id in os.listdir(brain_dir):
        logs_dir = os.path.join(brain_dir, conv_id, ".system_generated", "logs")
        transcript_path = os.path.join(logs_dir, "transcript.jsonl")
        if os.path.exists(transcript_path):
            with open(transcript_path, "r", encoding="utf-8", errors="ignore") as f:
                for line in f:
                    if "192.168.1.22" in line or "plink" in line or "ssh " in line:
                        # try to find command lines
                        try:
                            data = json.loads(line)
                            # check tool_calls
                            if "tool_calls" in data:
                                for tc in data["tool_calls"]:
                                    if "CommandLine" in tc.get("arguments", {}):
                                        cmd = tc["arguments"]["CommandLine"]
                                        if "192.168.1.22" in cmd or "ssh" in cmd or "plink" in cmd:
                                            print(f"[{conv_id}] Tool Call: {cmd}")
                            if "content" in data and ("192.168.1.22" in data["content"] or "ssh" in data["content"]):
                                print(f"[{conv_id}] Text Content snippet: {data['content'][:200]}")
                        except Exception:
                            # just print raw text if not json
                            if "CommandLine" in line:
                                print(f"[{conv_id}] Raw Match: {line[:200]}")
else:
    print("Brain directory does not exist")
