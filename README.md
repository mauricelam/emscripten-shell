![The logo](logo_full.png)

## Fork note

This fork was created for a browser-based demo of another Python-based project I am working on
([`pyolin`](https://github.com/mauricelam/pyolin)). Currently the code here is configured specifically to my
demo purposes, but with a few changes it's possible to make this generic to other projects.

If I get some more time, I will package this in a way that's suitable for other projects to use, but for now, here's the
list of things that needs to be changed to turn this into a demo for another python project.

* The configurations in `index.html` should be updated to load different PyPI packages and fetch different example files
* The `addCommand('pyolin', ...)` in `pyxtermplugin.ts` should be removed or changed to something else suitable for your
  project.

Changes in this fork:

* Use `local-echo` to support arrow keys and autocomplete
* Added a few commands, like `mkdir` and `grep`
* Support for basic shell syntax, like `&&`, `||`, and `|`. Note that this is very barebones – the execution is not
  concurrent, and exit codes are always assumed to be 0.

# Emscripten Shell

A lightweight POSIX-like shell interface for Emscripten Filesystems. This can be used for any Emscripten-backed application.

If using this shell with [Pyodide](https://github.com/pyodide/pyodide) project, additional functionality is included for using the Python interpreter in the Brower.

Finally, the shell element and Python extension are packaged as a [PyScript](https://github.com/pyscript/pyscript) [plugin](https://docs.pyscript.net/unstable/guides/custom-plugins.html) (see compatibility below).

## Status

The development here is so early it can't even be called Alpha. Use at your own risk.

## Compatibility (PyScript)

This plugin is only usable in versions of PyScript after the merge of [PR 1065](https://github.com/pyscript/pyscript/pull/1065) on Janaury 11, 2023. Currently, this is not part of any stable release of PyScript. To try it out, link to the `unstable` release at:

```html
<script defer src="https://pyscript.net/unstable/pyscript.js"></script>
<link rel="stylesheet" href="https://pyscript.net/unstable/pyscript.css">
```

## Usage (PyScript)

After building the plugin from source (see below), in the `<py-config>` section of your PyScript page, include a link to the build verison of this Plugin in `plugins` list.

Once the plugin has initialized, all `<py-xterm>` tags on the page will be linked to individual shells.

```html
<py-config>
    plugins = ["./pyxterm/build/pyxterm.js"]
</py-config>

<py-xterm></py-xterm>
```

The py-term element has one optional attribute, `FS`, which should be the name of the Emscripten Filesystem object in the JavaScript. If it is not provided, the default Filesystem location for PyScript (as of the above commit) will be used, which is `pyscript.interpreter.interface.FS`.

## Development

To build this plugin, first clone this repository. 

Then, from the command line, cd into the `pyxterm` folder. 

Run `npm install` to install the necessary packages.

Then run `npm run build` to build the plugin (which will be exported to `/build/pyxterm.js`), or `npm run dev` to automatically rebuild the plugin when changes are observed.

## Resources

### Xterm

- [xtermjs docs](http://xtermjs.org/docs/)
- [xterm control sequences](https://www.xfree86.org/current/ctlseqs.html)

### Commanderjs

- [Commanderjs GitHub](https://github.com/tj/commander.js#automated-help)

### Emscripten

- [Emscripten Filesystem API](https://emscripten.org/docs/api_reference/Filesystem-API.html)

### Interpreter

- [Code.py stdlib](https://github.com/python/cpython/blob/main/Lib/code.py)

## Prior Art

Some features of this project are inspired by other projects, including:

- [xterm-js-shell](https://github.com/RangerMauve/xterm-js-shell/blob/master/index.js)
- [This CodePen](https://codepen.io/iiiiiiiiiiiiiiiiiiiiii/pen/LYRjybP) - Author Unknown
- [pyTermTk](https://github.com/ceccopierangiolieugenio/pyTermTk)