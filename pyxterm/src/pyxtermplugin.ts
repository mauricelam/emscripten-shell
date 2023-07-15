import "../node_modules/xterm/css/xterm.css"

import { xtermElement as XtermElement, defaultOutputConfig } from "./xtermelement"
import { encodingUTF8 } from "./shell"
import { Command } from "commander"

import interactiveSrc from "./interactive.py"

class PyscriptXtermElement extends XtermElement {
    copyBlocker: EventListener | null

    constructor(private pyodide, FS) {
        super(FS)
    }

    connectedCallback(): void {
        super.connectedCallback();
        this.addPythonCommands();
        this.addEventListener('focusin', (event) => {
            this.addEventListener('copy', this.blockCopy);
        });

        this.addEventListener('focusout', (event) => {
            this.removeEventListener('copy', this.blockCopy);
        });
    }

    addPythonCommands() {
        const emsh = this.emsh;
        this.emsh.addCommand('pyolin', (fds) => new Command().name('pyolin')
            .description('Python one liners to easily parse and process data in Python.')
            .argument('[args...]', 'Pyolin program to execute')
            .allowUnknownOption()
            .helpOption(false)
            .action(async function (args) {
                emsh.executeCommand(['python', '-m', 'pyolin', ...args], fds)
            })
            .configureOutput(defaultOutputConfig(this.emsh)))
        this.emsh.addCommand('python', (fds) => new Command().name('python')
            .description("Run the python interpreter")
            .argument('[args...]', 'Python file to execute')
            .option('-m <module>', "Run the specified python module")
            .option('-c <code>', "Program passed in as string")
            .helpOption(false)  // Note: This is here just so that --help will be passed to the Python program
            .allowUnknownOption()
            .allowExcessArguments()
            .action(async (args, options) => {
                const stdin_iter = [fds.stdin].values()
                this.pyodide.setStdin({
                    isatty: true,
                    stdin: () => stdin_iter.next().value,
                })
                let stderrStream = new TextDecoder()
                let byteBuffer = new Uint8Array(new ArrayBuffer(1))
                this.pyodide.setStderr({
                    raw: (i) => {
                        byteBuffer[0] = i
                        fds.stderr(stderrStream.decode(byteBuffer, {stream: true}))
                    },
                    isatty: true,
                })
                let stdoutStream = new TextDecoder()
                this.pyodide.setStdout({
                    raw: (i) => {
                        byteBuffer[0] = i
                        fds.stdout(stdoutStream.decode(byteBuffer, {stream: true}))
                    },
                    isatty: true,
                })
                if (options.m) {
                    try {
                        this.pyodide.runPython(interactiveSrc)
                        this.pyodide.runPython('_pyterm_run_module')(options.m, args)
                    } catch (err) {
                        fds.stderr(`Error running python module '${options.m}':\n${err}`)
                        console.error(err)
                    }
                } else if (options.c) {
                    try {
                        this.pyodide.runPython(options.c)
                    } catch (err) {
                        fds.stderr(`Error running python code\n`)
                        console.error(err)
                    }
                } else if (args.length) {
                    try {
                        const filesrc = emsh.FS.readFile(args[0], encodingUTF8)
                        this.pyodide.runPython(filesrc)
                    } catch (err) {
                        fds.stderr(`Could not read source file '${args[0]}'\n`)
                        console.error(err)
                    }
                } else {
                    emsh.enterPythonMode(this.pyodide, interactiveSrc)
                }
                this.pyodide.setStdin({
                    isatty: true,
                    stdin: () => null,
                })
                this.pyodide.setStderr({
                    batched: emsh.write.bind(emsh)
                })
                this.pyodide.setStdin({
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
                        await this.pyodide.loadPackage(
                            packages,
                            {
                                messageCallback: (str) => { fds.stdout(str + "\n") },
                                errorCallback: (str) => { fds.stderr(str + "\n") },
                            }
                        )

                        const importlib = this.pyodide.pyimport("importlib")
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
        event.preventDefault()
    }
}
export default class pyXtermPlugin {
    afterSetup(interpreter) {
        setTimeout(() => {
            // Wait for pyscript things to finish initializing. (pyscript.interpreter in particular)
            customElements.define(
                "py-xterm",
                class extends PyscriptXtermElement {
                    constructor() {
                        const pyscript = globalThis['pyscript']
                        super(pyscript.interpreter.interface, pyscript.interpreter.FS)
                    }
                })
        }, 0);
    }
    beforePyScriptExec() { }

    afterPyScriptExec() { }

    afterStartup(runtime) {
    }
}