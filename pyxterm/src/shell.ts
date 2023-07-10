import type { Terminal } from "xterm";
import { Command } from 'commander'
import LocalEchoController from "local-echo";
import * as shellquote from 'shell-quote';

const version = "0.0.2"

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

interface FileDescriptorSet {
    stdin: string;
    stdout: (l: String) => void;
    stderr: (l: String) => void;
}

export const encodingUTF8 = { encoding: 'utf8' }
export class Emshell {
    terminal: Terminal
    keyhandler: IDisposable
    FS //Implements the Emscripten Filesystem API
    commands = new Map<String, (FileDescriptorSet) => Command>()
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
                try {
                    const line = await this.localEcho.read(this.linePrefix)
                    await this.executeLine(line)
                } catch (e) {
                    this.write(`\x1b[91m${e.message}\x1b[0m\n`)
                }
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
        // Recursive descent parsing

        let runExpression = async (tokens, fds: FileDescriptorSet) => {
            const opIndex = tokens.findIndex((tok) => typeof tok === 'object' && (tok.op === '&&' || tok.op === '||' || tok.op === ';'))
            if (opIndex === -1) {
                return await runPipes(tokens, fds);
            }
            const left = tokens.slice(0, opIndex);
            const right = tokens.slice(opIndex + 1);
            switch (tokens[opIndex].op) {
                case '&&':
                case ';':
                    await runPipes(left, fds);
                    await runExpression(right, fds);
                    break
                case '||':  // TODO: Implement exit code
                    await runPipes(left, fds);
                    break
                default:
                    throw Error(`Unsupported operator ${tokens[opIndex].op}`)
            }
        }

        let runPipes = async (tokens, fds: FileDescriptorSet) => {
            const opIndex = tokens.findIndex((tok) => typeof tok === 'object' && (tok.op === '|'))
            if (opIndex === -1) {
                return await runSingleCommand(tokens, fds);
            }
            const left = tokens.slice(0, opIndex);
            const right = tokens.slice(opIndex + 1);
            switch (tokens[opIndex].op) {
                case '|':
                    let leftOutput = [];
                    await runSingleCommand(left, { stdin: fds.stdin, stdout: (l) => leftOutput.push(l), stderr: fds.stderr });
                    console.log('leftoutput', leftOutput, right)
                    await runPipes(right, { stdin: leftOutput.join(''), stdout: fds.stdout, stderr: fds.stderr });
                    break
                default:
                    throw Error(`Unsupported operator ${tokens[opIndex].op}`)
            }
        }

        let runSingleCommand = async (tokens, fds: FileDescriptorSet) => {
            const operator = tokens.find((tok) => typeof tok === 'object')
            if (operator !== undefined) {
                throw Error(`Unsupported operator "${operator.op}"`)
            }
            if (this.commands.has(tokens[0])) {
                const command_fn = this.commands.get(tokens[0])
                const command = command_fn(fds)
                try {
                    await command.parseAsync(tokens.slice(1), { from: 'user' })
                } catch (e) {
                    console.warn(e);
                }
            } else {
                fds.stderr(`No command found matching '${tokens[0]}'. Known commands are `)
                fds.stderr(Array.from(this.commands.keys()).join(', '))
                fds.stderr('\n')
            }
        }

        const tokens = shellquote.parse(line)
        console.log('tokens', tokens)
        await runExpression(tokens, this.defaultFileDescriptorSet())
    }

    addCommand(name: String, command: (fds: FileDescriptorSet) => Command) {
        this.commands.set(name, command)
    }

    makeCommands() {
        this.addCommand('ls', (fds) => new Command().name('ls')
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
                        fds.stdout(`${pre}${path}${post}  `)
                    });
                    fds.stdout('\n')
                }
                catch (err) {
                    fds.stderr(`Could not print files from path ${path}`)
                    console.error(err)
                }
            })
            .configureOutput(defaultOutputConfig(this))
        )

        this.addCommand('echo', (fds) => new Command().name('echo')
            .description('Write arguments to the standard output')
            .argument('[args...]', 'Arguments to be printed')
            .action(async (args) => {
                fds.stdout(`${args.join(" ")}\n`)
            })
            .configureOutput(defaultOutputConfig(this))
        )

        this.addCommand('pwd', (fds) => new Command().name('pwd')
            .description("Gets the current working directory")
            .action(async (options) => {
                fds.stdout(this.FS.cwd())
                fds.stdout('\n')
            })
            .configureOutput(defaultOutputConfig(this))
        )

        this.addCommand('cd', (fds) => new Command().name('cd')
            .description("Change the current working directory")
            .argument('[path]', 'the directory to change to')
            .action(async (path: String, options) => {
                if (!path) {
                    fds.stderr("You must provide a [path] to change to\n")
                } else {
                    try {
                        const foundNode = this.FS.lookupPath(path)
                        this.FS.chdir(foundNode.path);
                    }
                    catch (error) {
                        fds.stderr(`Could not resolve path '${path}'\n`)
                    }
                }
            })
            .configureOutput(defaultOutputConfig(this))
        )

        this.addCommand('cat', (fds) => new Command().name('cat')
            .description('Print the contents of a file to the terminal')
            .argument('[paths...]', 'The path(s) to the file to be printed')
            .option('-n', 'Print line numbers')
            .action(async (paths, options) => {
                if (!paths.length) {
                    if (fds.stdin !== null) {
                        fds.stdout(fds.stdin)
                    } else {
                        fds.stderr(`'cat' without input is supported\n`)
                    }
                    return
                }
                paths.forEach((path, index) => {
                    try {
                        let contents = this.FS.readFile(path, encodingUTF8)
                        if (options.n) {
                            console.log("LINE NUMBERS")
                            contents = contents.split('\n').map((line, index) => `${index + 1} ${line}`).join('\n')
                        }
                        fds.stdout(contents)
                    } catch (err) {
                        console.error(err)
                        fds.stderr(`${err}\n`)
                    }
                });
            })
            .configureOutput(defaultOutputConfig(this))
        )

        this.addCommand('grep', (fds) => new Command().name('grep')
            .description('The grep utility searches any given input files, selecting lines that match one or more patterns.')
            .argument('pattern', 'Specify a pattern used during the search of the input: an input line is selected if it matches any of the specified patterns.')
            // .argument('[paths...]', 'The path(s) to the file to be printed')
            // .option('-n', 'Print line numbers')
            .action(async (pattern, options) => {
                if (fds.stdin !== null) {
                    const regex = new RegExp(pattern)
                    for (const line of fds.stdin.split('\n')) {
                        const searchResult = line.search(regex)
                        if (searchResult !== -1) {
                            fds.stdout(line + '\n')
                        }
                    }
                } else {
                    fds.stderr(`'grep' without input is supported\n`)
                }
            })
            .configureOutput(defaultOutputConfig(this))
        )

        this.addCommand('touch', (fds) => new Command().name('touch')
            .description('Modify the access time for a file')
            .argument('<path>', 'The path to the file to create or adjust the time on')
            .action(async (path) => {
                try {
                    this.FS.writeFile(path, '')
                } catch (err) {
                    fds.stderr(`Could not touch path ${path}\n`)
                    console.error(err)
                }
            })
            .configureOutput(defaultOutputConfig(this))
        )

        this.addCommand('mkdir', (fds) => new Command().name('mkdir')
            .description("Create a new directory in the file system")
            .argument('path', 'The directory to be created')
            .action(async (path) => {
                try {
                    console.log(path)
                    this.FS.mkdir(path)
                } catch (err) {
                    fds.stderr(`Unable to create directory at '${path}'\n`)
                    console.error(err)
                }
            })
            .configureOutput(defaultOutputConfig(this))
        )

        this.addCommand('clear', (fds) => new Command().name('clear')
            .description('Clear the screen')
            .action(async () => {
                this.terminal.clear()
            })
            .configureOutput(defaultOutputConfig(this))
        )

        this.addCommand('help', (fds) => new Command().name('help')
            .description('Get help!')
            .argument('[command]', 'The command to get help with')
            .action(async (command) => {
                if (command) {
                    const thiscommand = this.commands.get(command)(this.defaultFileDescriptorSet())
                    fds.stdout(thiscommand.helpInformation() + "\n")
                } else {
                    fds.stdout(`Emscripten-Shell, version ${version}\n`)
                    fds.stdout("These shell commands are defined internally.  Type `help' to see this list.\n")
                    fds.stdout("Type `help name' to find out more about the function `name'.\n")
                    //Display name and short description of each command
                    Array.from(this.commands.keys()).sort().forEach(key => {
                        const thiscommand = this.commands.get(key)(this.defaultFileDescriptorSet())
                        fds.stdout(` ${key}\n`)
                        const shortDescription = thiscommand.summary() ? thiscommand.summary() : thiscommand.description()
                        fds.stdout(`\x1b[20G${shortDescription}\n`)
                    })
                }
            })
            .configureOutput(defaultOutputConfig(this))
        )
    }

    defaultFileDescriptorSet(): FileDescriptorSet {
        return {
            stdin: null,
            stdout: this.write.bind(this),
            stderr: this.write.bind(this),
        }
    }

    get linePrefix() {
        return '\x1b[93m' + this.FS.cwd() + "$ " + '\x1b[0m'
    }
}