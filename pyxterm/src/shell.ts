import type { Terminal } from "xterm";
import { Command } from 'commander'
import LocalEchoController from "local-echo";

const version = "0.0.1"

type IDisposable = {
    dispose(): void
}

export const defaultOutputConfig = (emsh) => {
    return {
        writeOut: (str) => { emsh.write(str) },
        writeErr: (str) => { emsh.write(`\x1b[91m${str}\x1b[0m`) },
        getErrHelpWidth: () => { return 40 }, //Todo - make this actual terminal width
        getOutHelpWidth: () => { return 40 }, //Todo - make this actual terminal width
    }
}

export const encodingUTF8 = { encoding: 'utf8' }
export class Emshell {
    terminal: Terminal
    keyhandler: IDisposable
    FS //Implements the Emscripten Filesystem API
    commands = new Map<String, Command>()
    localEcho: LocalEchoController
    alternateHistory = []
    pyInterp = null

    currentLine = ''


    constructor(terminal: Terminal, FS) {
        this.terminal = terminal;
        this.FS = FS;
        this.localEcho = new LocalEchoController();
        terminal.loadAddon(this.localEcho);
        this.keyhandler = this.terminal.onKey(this.onKey.bind(this));
        this.makeCommands();
    }

    onKey(e: { key: string, domEvent: KeyboardEvent }, f: void) {
        // Add special key bindings here
    }

    write(value: any) {
        const output = String(value).replace(/\n/g, '\n\r')
        this.terminal.write(output)
    }

    async shellRepl() {
        this.currentLine = ''
        while (true) {
            if (this.pyInterp) {
                try {
                    const [ps1, ps2] = this.pyInterp.getPromptString()
                    const line = await this.localEcho.read(ps1, ps2)
                    this.pyInterp.executeLine(line)
                } catch (e) {
                    console.warn(e);
                }
            } else {
                const line = await this.localEcho.read(this.linePrefix)
                await this.executeLine(line)
            }
        }
    }

    enterPythonMode(pyscriptModule, interactiveSrc) {
        const pyInterpClass = pyscriptModule.interpreter.interface.runPython(interactiveSrc)
        this.pyInterp = pyInterpClass(this)

        this.keyhandler.dispose()
        this.alternateHistory = this.localEcho.history.entries
        this.localEcho.history.entries = []
        this.localEcho.history.rewind()
        this.pyInterp.beginInteraction()

        this.keyhandler = this.terminal.onKey(this.pyInterp.onKey)
    }

    exitPythonMode() {
        this.keyhandler?.dispose()
        this.keyhandler = this.terminal.onKey(this.onKey.bind(this))
        this.localEcho.history.entries = this.alternateHistory
        this.localEcho.history.rewind()
        this.alternateHistory = []
        this.pyInterp = null
        this.localEcho.abortRead('exitPython')
    }

    async executeLine(line: String) {
        // Try to execute first token as command
        const tokens = line.split(' ')
        if (this.commands.has(tokens[0])) {
            const command = this.commands.get(tokens[0])
            try {
                await command.parseAsync(tokens.slice(1), { from: 'user' })
            } catch (e) {
                console.warn(e);
            }
        } else {
            this.write(`No command found matching '${line}'. Known commands are `)
            this.write(Array.from(this.commands.keys()).join(', '))
            this.write('\n')
        }
    }

    addCommand(name: String, command: Command) {
        this.commands.set(name, command)
    }

    makeCommands() {
        this.addCommand('ls', new Command().name('ls')
            .description("List files")
            .argument('[path]', 'the path to list files from (optional)')
            .action(async (path: String, options) => {
                if (!path) {
                    path = '.'
                }
                try {
                    const contents: Array<String> = this.FS.readdir(path)
                    contents.forEach(path => {
                        let pre = ''
                        let post = ''
                        const mode = this.FS.stat(path).mode
                        //Color Coding
                        if (this.FS.isFile(mode) && path.substring(path.length - 3) == '.py') {
                            pre = '\x1b[93m'
                            post = '\x1b[0m'
                        }
                        else if (this.FS.isDir(mode)) {
                            pre = '\x1b[96m'
                            post = '\x1b[0m'
                        }
                        this.write(`${pre}${path}${post}  `)
                    });
                    this.write('\n')
                }
                catch (err) {
                    this.write(`Could not print files from path ${path}`)
                    console.error(err)
                }
            })
            .configureOutput(defaultOutputConfig(this))
        )

        this.addCommand('echo', new Command().name('echo')
            .description('Write arguments to the standard output')
            .argument('[args...]', 'Arguments to be printed')
            .action(async (args) => {
                this.write(`${args.join(" ")}\n`)
            })
            .configureOutput(defaultOutputConfig(this))
        )

        this.addCommand('pwd', new Command().name('pwd')
            .description("Gets the current working directory")
            .action(async (options) => {
                this.write(this.FS.cwd())
                this.write('\n')
            })
            .configureOutput(defaultOutputConfig(this))
        )

        this.addCommand('cd', new Command().name('cd')
            .description("Change the current working directory")
            .argument('[path]', 'the directory to change to')
            .action(async (path: String, options) => {
                if (!path) {
                    this.write("You must provide a [path] to change to\n")
                } else {
                    try {
                        const foundNode = this.FS.lookupPath(path)
                        this.FS.chdir(foundNode.path);
                    }
                    catch (error) {
                        this.write(`Could not resolve path '${path}'\n`)
                    }
                }
            })
            .configureOutput(defaultOutputConfig(this))
        )

        this.addCommand('cat', new Command().name('cat')
            .description('Print the contents of a file to the terminal')
            .argument('[paths...]', 'The path(s) to the file to be printed')
            .option('-n', 'Print line numbers')
            .action(async (paths, options) => {
                paths.forEach((path, index) => {
                    try {
                        let contents = this.FS.readFile(path, encodingUTF8)
                        if (options.n) {
                            console.log("LINE NUMBERS")
                            contents = contents.split('\n').map((line, index) => `${index + 1} ${line}`).join('\n')
                        }
                        this.write(contents)
                    }
                    catch (err) {
                        console.error(err)
                    }
                });
            })
            .configureOutput(defaultOutputConfig(this))
        )

        this.addCommand('touch', new Command().name('touch')
            .description('Modify the access time for a file')
            .argument('<path>', 'The path to the file to create or adjust the time on')
            .action(async (path) => {
                try {
                    this.FS.writeFile(path, '')
                } catch (err) {
                    this.write(`Could not touch path ${path}\n`)
                    console.error(err)
                }
            })
            .configureOutput(defaultOutputConfig(this))
        )

        this.addCommand('mkdir', new Command().name('mkdir')
            .description("Create a new directory in the file system")
            .argument('path', 'The directory to be created')
            .action(async (path) => {
                try {
                    console.log(path)
                    this.FS.mkdir(path)
                } catch (err) {
                    this.write(`Unable to create directory at '${path}'\n`)
                    console.error(err)
                }
            })
            .configureOutput(defaultOutputConfig(this))
        )

        this.addCommand('clear', new Command().name('clear')
            .description('Clear the screen')
            .action(async () => {
                this.terminal.clear()
            })
            .configureOutput(defaultOutputConfig(this))
        )

        this.addCommand('help', new Command().name('help')
            .description('Get help!')
            .argument('[command]', 'The command to get help with')
            .action(async (command) => {
                if (command) {
                    this.write(this.commands.get(command).helpInformation() + "\n")
                } else {
                    this.write(`Emscripten-Shell, version ${version}\n`)
                    this.write("These shell commands are defined internally.  Type `help' to see this list.\n")
                    this.write("Type `help name' to find out more about the function `name'.\n")
                    //Display name and short description of each command
                    Array.from(this.commands.keys()).sort().forEach(key => {
                        this.write(` ${key}\n`)
                        const shortDescription = this.commands.get(key)?.summary() ? this.commands.get(key).summary() : this.commands.get(key).description()
                        this.write(`\x1b[20G${shortDescription}\n`)
                    })
                }
            })
            .configureOutput(defaultOutputConfig(this))
        )

    }

    get linePrefix() {
        return '\x1b[93m' + this.FS.cwd() + "$ " + '\x1b[0m'
    }
}