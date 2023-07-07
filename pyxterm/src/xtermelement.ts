import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";

import { Emshell } from "./shell";
import { Command } from "commander";

export { defaultOutputConfig } from "./shell"

export class xtermElement extends HTMLElement {
    FS //Implements the Emscripten Filesystem API
    emsh: Emshell
    terminal: Terminal

    constructor() {
        super();
    }

    connectedCallback() {
        this.terminal = new Terminal({
            allowProposedApi: true,
            cursorBlink: true,
        });

        let FS

        const fsName = this.getAttribute("FS")
        if (fsName) {
            FS = eval(fsName)
        }
        else if ('pyscript' in globalThis) {
            FS = globalThis['pyscript'].interpreter.interface.FS
        }
        else {
            throw new EvalError(`Filesystem could not be indentified from FS=${fsName} or PyScript default`)
        }

        this.emsh = new Emshell(this.terminal, FS);

        const fit = new FitAddon();
        this.terminal.loadAddon(fit);

        this.terminal.open(this);
        fit.fit();

        this.emsh.write(`Started EmShell at ${new Date()}\n`)
        this.emsh.write("Type 'help' to see a list of commands\n")
        this.emsh.shellRepl()
    }
}

export function makeXtermElement() {
    customElements.define("x-term", xtermElement)
}