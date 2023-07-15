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
        const emsh = this.emsh;
        this.emsh.addCommand('pyolin', (fds) => new Command().name('pyolin')
            .description('Python one liners to easily parse and process data in Python.')
            .argument('[args...]', 'Pyolin program to execute')
            .allowUnknownOption()
            .action(async function (args) {
                emsh.executeCommand(['python', '-m', 'pyolin', ...args], fds)
            })
            .configureOutput(defaultOutputConfig(this.emsh)))
        this.emsh.addCommand('python', (fds) => new Command().name('python')
            .description("Run the python interpreter")
            .argument('[args...]', 'Python file to execute')
            .option('-m <module>', "Run the specified python module")
            .option('-c <code>', "Program passed in as string")
            .allowUnknownOption()
            .allowExcessArguments()
            .action(async function (args, options) {
                const stdin_iter = [fds.stdin].values()
                pyscriptModule.interpreter.interface.setStdin({
                    isatty: true,
                    stdin: () => stdin_iter.next().value,
                })
                pyscriptModule.interpreter.interface.setStderr({
                    raw: (i) => fds.stderr(String.fromCharCode(i)),
                    isatty: true,
                })
                pyscriptModule.interpreter.interface.setStdout({
                    raw: (i) => fds.stdout(String.fromCharCode(i)),
                    isatty: true,
                })
                if (options.m) {
                    try {
                        pyscriptModule.interpreter.interface.runPython(interactiveSrc)
                        pyscriptModule.interpreter.interface.runPython('_pyterm_run_module')(options.m, args)
                    } catch (err) {
                        fds.stderr(`Error running python module '${options.m}':\n${err}`)
                        console.error(err)
                    }
                } else if (options.c) {
                    try {
                        pyscriptModule.interpreter.interface.runPython(options.c)
                    } catch (err) {
                        fds.stderr(`Error running python code\n`)
                        console.error(err)
                    }
                } else if (args.length) {
                    try {
                        const filesrc = emsh.FS.readFile(args[0], encodingUTF8)
                        pyscriptModule.interpreter.interface.runPython(filesrc)
                    } catch (err) {
                        fds.stderr(`Could not read source file '${args[0]}'\n`)
                        console.error(err)
                    }
                } else {
                    emsh.enterPythonMode(pyscriptModule, interactiveSrc)
                }
                pyscriptModule.interpreter.interface.setStdin({
                    isatty: true,
                    stdin: () => null,
                })
                pyscriptModule.interpreter.interface.setStderr({
                    batched: emsh.write.bind(emsh)
                })
                pyscriptModule.interpreter.interface.setStdin({
                    batched: emsh.write.bind(emsh)
                })
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