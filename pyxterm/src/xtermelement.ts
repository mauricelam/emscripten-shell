import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";

import { Emshell } from "./shell";

export { defaultOutputConfig } from "./shell"

export class xtermElement extends HTMLElement {
    emsh: Emshell
    terminal: Terminal

    constructor(private FS) {
        super()
    }

    connectedCallback() {
        this.terminal = new Terminal({
            allowProposedApi: true,
            cursorBlink: true,
        });

        this.emsh = new Emshell(this.terminal, this.FS)

        const fit = new FitAddon()
        this.terminal.loadAddon(fit)

        this.terminal.open(this)
        fit.fit()

        this.emsh.write(`Started EmShell at ${new Date()}\n`)
        this.emsh.write("Type 'help' to see a list of commands\n")
        this.emsh.shellRepl()
    }
}

// export function makeXtermElement() {
//     customElements.define("x-term", xtermElement)
// }