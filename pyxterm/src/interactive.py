from code import InteractiveConsole
import sys

import js
from pyodide.ffi import to_js


class xtermInteractive(InteractiveConsole):
    def __init__(self, emshell, locals=None, filename="<console>"):
        super().__init__(locals, filename)
        self.emshell = emshell
        self.line = ""
        self.more = 0

    def write(self, data):
        self.emshell.write(data)

    def flush(self):
        # Makes this object file-like to act as sys.stdout and sys.stderr
        pass

    def beginInteraction(self, banner=None, exitmsg=None):
        cprt = 'Type "help", "copyright", "credits" or "license" for more information.'
        if banner is None:
            self.write("Python %s on %s\n%s\n" % (sys.version, sys.platform, cprt))
        elif banner:
            self.write(f"{str(banner)}")

        sys.stdout = self
        sys.stderr = self

        self.more = 0

    def executeLine(self, line):
        js.console.log('line' + line)
        self.more = self.push(line)

    def getPromptString(self):
        try:
            ps1 = sys.ps1
        except AttributeError:
            ps1 = sys.ps1 = ">>> "
        try:
            ps2 = sys.ps2
        except AttributeError:
            ps2 = sys.ps2 = "... "
        if self.more:
            return (ps2, ps2)
        else:
            return (ps1, ps2)

    # onKey(e: {key: string, domEvent: KeyboardEvent}, f: void)
    def onKey(self, event, f):
        # js.console.log(f"Got key {event.key}")
        # js.console.log(to_js(event.domEvent))
        if event.domEvent.ctrlKey and event.domEvent.key == "d":
            self.emshell.exitPythonMode()


def _pyterm_run_module(module_name, args):
    import pyodide
    import sys
    try:
        sys.argv = ['prog', *args.to_py()]
        import runpy; runpy.run_module(module_name, run_name = '__main__', alter_sys = True)
    except SystemExit:
        pass
    except Exception as e:
        print(e, file=sys.stderr)

xtermInteractive
