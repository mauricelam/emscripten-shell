import "../node_modules/xterm/css/xterm.css"

import { xtermElement, defaultOutputConfig } from "./xtermelement"
import { encodingUTF8 } from "./shell"
import { Command } from "commander"

import interactiveSrc from "./interactive.py"

class pyscriptXtermElement extends xtermElement {
    pyscript //PyScriptApp
    copyBlocker: EventListener | null

    constructor() {
        super()
    }

    connectedCallback(): void {
        super.connectedCallback();
        this.addPythonCommands(globalThis['pyscript']);
        this.addEventListener('focusin', (event) => {
            this.addEventListener('copy', this.blockCopy);
        });

        this.addEventListener('focusout', (event) => {
            this.removeEventListener('copy', this.blockCopy);
        });
    }

    addPythonCommands(pyscriptModule) {
        this.emsh.addCommand('python', (fds) => new Command().name('python')
            .description("Run the python interpreter")
            .argument('[file]', 'Python file to execute')
            .option('-m <path>', "Run the specified python module")
            .action(async (file, options) => {
                if (options.m) {
                    try {
                        pyscriptModule.interpreter.interface.runPython(`import runpy; runpy.run_module('${options.m}')`)
                    } catch (err) {
                        fds.stderr(`Error running python module '${options.m}'\n`)
                        console.error(err)
                    }
                } else if (file) {
                    try {
                        const filesrc = this.emsh.FS.readFile(file, encodingUTF8)
                        pyscriptModule.interpreter.interface.runPython(filesrc)
                    } catch (err) {
                        fds.stderr(`Could not read source file '${file}'\n`)
                        console.error(err)
                    }
                } else {
                    this.emsh.enterPythonMode(pyscriptModule, interactiveSrc)
                }
            })
            .configureOutput(defaultOutputConfig(this.emsh))
        )

        this.emsh.addCommand("pip", (fds) => {
            const pip = new Command().name('pip')
                .description("Install new packages")
                .exitOverride();

            pip.command('install')
                .argument('[packages...]', 'the packages to be installed')
                .action(async (packages) => {
                    try {
                        await pyscriptModule.interpreter.interface.loadPackage(
                            packages,
                            {
                                messageCallback: (str) => { fds.stdout(str + "\n") },
                                errorCallback: (str) => { fds.stderr(str + "\n") },
                            }
                        )

                        const importlib = pyscriptModule.interpreter.interface.pyimport("importlib")
                        importlib.invalidate_caches()
                    } catch (e) {
                        fds.stderr(e.message + '\n')
                    }
                })
                .configureOutput(defaultOutputConfig(this.emsh))

            return pip
        });
    }

    blockCopy(event) {
        event.preventDefault; return false;
    }
}
export default class pyXtermPlugin {
    afterSetup(interpreter) {
        setTimeout(() => {
            // Wait for pyscript things to finish initializing. (pyscript.interpreter in particular)
            customElements.define("py-xterm", pyscriptXtermElement)
        }, 0);
    }
    beforePyScriptExec() { }

    afterPyScriptExec() { }

    afterStartup(runtime) {
    }
}