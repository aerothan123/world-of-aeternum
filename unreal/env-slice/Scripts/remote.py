# Runs one Python statement block inside a running EnvSlice editor through
# the Python plugin's remote execution (DefaultEngine.ini bRemoteExecution),
# and prints what it returns. Run with the engine's own interpreter:
#   python.exe remote.py "print(unreal.SystemLibrary.get_engine_version())"
import os
import sys
import time

sys.path.append(r"E:\UE_5.8\Engine\Plugins\Experimental\PythonScriptPlugin\Content\Python")
import remote_execution as rx  # noqa: E402

code = sys.argv[1] if len(sys.argv) > 1 else "print('ok')"
if os.path.isfile(code):
    with open(code, encoding="utf8") as f:
        code = f.read()
r = rx.RemoteExecution()
r.start()
deadline = time.time() + 8
while not r.remote_nodes and time.time() < deadline:
    time.sleep(0.2)
if not r.remote_nodes:
    print("no editor node found")
    r.stop()
    sys.exit(2)
r.open_command_connection(r.remote_nodes[0]["node_id"])
res = r.run_command(code, unattended=True, exec_mode=rx.MODE_EXEC_FILE)
for o in res.get("output", []):
    print(o.get("output", "").rstrip())
print("result:", res.get("success"), res.get("result"))
r.stop()
