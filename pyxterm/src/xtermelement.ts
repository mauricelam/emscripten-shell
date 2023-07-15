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

        new ResizeObserver((entries) => fit.fit()).observe(this)

        this.emsh.write(`
_____             _ _         _____
|  __ \\           | (_)       |  __ \\
| |__) |   _  ___ | |_ _ __   | |  | | ___ _ __ ___   ___
|  ___/ | | |/ _ \\| | | '_ \\  | |  | |/ _ \\ '_ \` _ \\ / _ \\
| |   | |_| | (_) | | | | | | | |__| |  __/ | | | | | (_) |
|_|    \\__, |\\___/|_|_|_| |_| |_____/ \\___|_| |_| |_|\\___/
        __/ |
        |___/                                               \n`)
        this.emsh.write(`
Welcome to the Pyolin demo. This is a simulated shell environment
in the browser to test out pyolin.

Pyolin is the tool to help write Python one liners. There are a
number of data files in the current directory that you can use to
test the functionalities of pyolin. For example, try

    cat data_addresses_unix.csv | pyolin --field_separator=, 'r for r in records if r[3] == "Riverside"'

Type 'help' to see a list of commands\n`)
        this.emsh.shellRepl()
    }
}

// export function makeXtermElement() {
//     customElements.define("x-term", xtermElement)
// }