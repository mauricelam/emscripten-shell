import { pyscriptXtermElement } from "./pyXtermElement"

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