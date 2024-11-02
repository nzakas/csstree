export function printAst(ast, options) {
    const { decorate, outline = true } = options || {};
    const printer = createPrinter(normalizeDecorate(decorate));
    const setup = {
        inlineSingleEntry: false,
        outline: Boolean(outline),
        getTag(value) {
            return value?.type;
        },
        isList(value, prop) {
            return Array.isArray(value) || prop === 'children';
        },
        ignoreProperty(prop) {
            return (
                prop === 'type' ||
                prop === 'loc' ||
                prop === 'start' ||
                prop === 'end'
            );
        }
    };

    printInternal(ast, setup, printer);

    return printer.emit();
}

function printInternal(root, setup, printer) {
    function renderValue(value) {
        printer.value(typeof value === 'string' ? JSON.stringify(value) : String(value));
        printer.newline();
    }

    function renderList(node, property, self, nested) {
        const list = node[property];

        if (!list) {
            return;
        }

        printer.outline(self);
        printer.property(property);

        if (!list.length && !list.size) {
            printer.value('<empty>');
            printer.newline();
            return;
        }

        printer.newline();

        const size = list.length || list.size;
        let idx = 0;
        for (const child of list) {
            if (++idx < size) {
                renderNode(child, `${nested}${o1}`, `${nested}${o2}${setup.outline ? '' : ' '}`, idx - 1);
            } else {
                renderNode(child, `${nested}${o3}`, `${nested}${o0}${setup.outline ? '' : ' '}`, idx - 1);
            }
        }
    }

    const o0 = setup.outline ? '  ' : ' ';
    const o1 = setup.outline ? '├─' : ' ';
    const o2 = setup.outline ? '│ ' : ' ';
    const o3 = setup.outline ? '└─' : ' ';

    function renderEntries(node, entries, self, nested) {
        if (entries.length === 0) {
            return;
        }

        const isSingleEntry = entries.length === 1 && setup.inlineSingleEntry;
        const __self = key => isSingleEntry ? '' : key === lastKey ? o3 : o1;
        const __nested = key => isSingleEntry ? '' : key === lastKey ? o0 + ' ' : o2 + ' ';
        const objects = [];
        const arrays = [];
        let lastKey = entries[entries.length - 1][0];

        for (const [key, value] of entries) {
            if (setup.getTag(value, key, node)) {
                objects.push(key);
                lastKey = arrays.length === 0 ? key : lastKey;
            } else if (setup.isList(value, key, node)) {
                arrays.push(key);
                lastKey = key;
            } else {
                printer.outline(self + __self(key));
                printer.property(key);
                renderValue(value);
            }
        }

        for (const key of objects) {
            const tag = setup.getTag(node[key]);
            const other = nested + (typeof tag === 'string' ? '' : __nested(key));

            printer.outline(self + __self(key));
            printer.property(key);

            if (typeof tag === 'string') {
                printer.tag(tag);
                renderNode(node[key], `${other}${o3}`, `${other}${o0} `, undefined, true);
            } else {
                printer.newline();
                renderNode(node[key], `${other}${o3}`, `${other}${o0} `);
            }
        }

        for (const key of arrays) {
            renderList(node, key, self + __self(key), nested + (setup.outline ? __nested(key) : __nested(key).slice(1)));
        }
    }

    function renderNode(node, self = '', nested = '', index, skipTag) {
        const tag = setup.getTag(node);

        if (!skipTag) {
            printer.outline(self);
        }

        if (Number.isFinite(index)) {
            printer.index(index);
            nested += ' ';
        }

        if (typeof tag !== 'string') {
            renderValue(node);
            return;
        }

        const entries = Object.entries(node)
            .filter(([key]) => !setup.ignoreProperty(key, node));

        if (!skipTag) {
            printer.tag(tag);
        }

        if (entries.length === 1 && setup.inlineSingleEntry) {
            renderEntries(node, entries, '', nested /* + (Number.isFinite(index) ? '   ' : '') */);
        } else {
            printer.newline();
            renderEntries(node, entries, nested, nested);
        }
    }

    renderNode(root);
}

function normalizeDecorate(decorate) {
    const selfFn = value => value;
    const result = {
        tag: selfFn,
        index: selfFn,
        property: selfFn,
        colon: selfFn,
        value: selfFn,
        outline: selfFn
    };

    if (decorate) {
        for (const key of Object.keys(result)) {
            if (typeof decorate[key] === 'function') {
                result[key] = decorate[key];
            }
        }
    }

    return result;
}

function createPrinter(decorate) {
    const TAG = 1;
    const PROPERTY = 2;
    const INDEX = 3;
    const VALUE = 4;
    const OUTLINE = 5;
    const NEWLINE = 6;
    const space = new Set([
        16 * TAG + PROPERTY,
        16 * PROPERTY + VALUE,
        16 * PROPERTY + TAG,
        16 * INDEX + TAG,
        16 * INDEX + VALUE,
        16 * OUTLINE + TAG,
        16 * OUTLINE + PROPERTY
    ]);
    const put = (next, str) => {
        buffer += space.has(16 * prev + next) ? ' ' + str : str;
        prev = next;
    };
    const colon = decorate.colon(':');
    let prev = 0;
    let buffer = '';

    return {
        tag: str => put(TAG, decorate.tag(str)),
        index: index => put(INDEX, decorate.index(`[${index}]`)),
        property: str => put(PROPERTY, decorate.property(str) + colon),
        value: str => put(VALUE, decorate.value(str)),
        outline: str => str && put(OUTLINE, decorate.outline(str)),
        newline: () => put(NEWLINE, '\n'),
        emit: () => buffer
    };
}