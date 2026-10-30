---
name: plan-map
description: >
  Draw an implementation plan on the repository's atlas map: a draft of the map marked with what the plan adds, changes and removes, shown on /atlas:board and linked from the plan. Use when writing or revising a plan in a repository that holds an atlas map folder.
argument-hint: "[map folder]"
allowed-tools:
  - Bash(bun --config=${CLAUDE_PLUGIN_ROOT}/child.bunfig.toml --no-env-file ${CLAUDE_PLUGIN_ROOT}/src/cli.ts *)
---

# atlas plan map

The plan map is a draft of the repository's atlas map (`drafts/<name>/` in the map folder, which
its `.gitignore` lists) that shows the map as it stands once the plan is done. The map itself stays
as it is until the plan is carried out.

Every command below runs from the repository root, and names `cli.ts` for short: run it as
`bun --config=${CLAUDE_PLUGIN_ROOT}/child.bunfig.toml --no-env-file ${CLAUDE_PLUGIN_ROOT}/src/cli.ts`,
so that a `bunfig.toml` or a `.env` of the repository loads nothing into it. In plan mode, the
draft is part of the plan: it lives in an ignored folder, and `cli.ts edit` writes it where the
Edit tool writes the plan file alone.

## Steps

1. **Find the map.** The argument names the map folder. Without one, the map folders are the
   folders holding an `atlas.config.ts`, outside any `drafts/` folder. None: the plan gets no plan
   map, and this skill ends. Several: ask the user which one. Done when you hold one map folder.

2. **List the changes.** Read the plan and the map (`cli.ts query <map folder> <node id>` prints
   one node with its children and links). Write the change list: every component, module, service
   or flow the plan adds, changes or removes, each tied to the node or link of the map it lands
   on, or to the container a new node goes in. Done when every step of the plan that touches the
   architecture has a line, and every line names an id of the map. A plan that touches no element
   of the map gets, in place of the section of step 7, one sentence saying why; the skill ends
   there.

3. **Make the draft.** Name it `plan-<subject>`, kebab-case, the plan's subject in two to four
   words. Run `cli.ts draft <map folder> <name>`; it prints the draft folder. A plan revised in
   the same session keeps its draft: edit that one. A draft of that name left by another plan:
   pick another name.

4. **Mark the draft.** Write each mark of the section below with `cli.ts edit`. It takes the map
   folder, the draft's name and one data file of the draft (`map.ts`, `atlas.config.ts`, a
   `parts/*.ts`), and reads blocks on stdin, each text to replace found exactly once in the file,
   as Edit's `old_string`:

   ```bash
   cli.ts edit <map folder> <name> map.ts <<'EOF'
   <<<<<<< OLD
   the text to replace, with enough lines to be unique
   =======
   the text that replaces it
   >>>>>>> NEW
   EOF
   ```

   A failing block leaves the file unchanged and names the block. Write every text in the language
   of the map's `atlas.config.ts` (`lang`), and in the style of the nodes around it. Done when
   every line of the change list has its mark.

5. **Check the draft.** Run `cli.ts fmt <draft folder>`, then `cli.ts check <draft folder>`, and
   fix what it reports. Done when check exits 0.

6. **Show it.** Ask the user to run `/atlas:board <map folder> <name>`, and end the turn there:
   only the user runs it. Its lines name the page's address. Done when you hold the address.

7. **Link it from the plan.** Add a section to the plan, in the plan's language, holding:
   - for each view that shows a marked node as a child, a pair of links: after the plan,
     `<address>#<container id>`, and before it, `<address>#<container id>?phase=<before phase>`.
     The container is the marked node's parent; a child of the root, an outside node among them,
     shows in the root's view: `<address>` and `<address>#?phase=<before phase>`. A node marked in
     one view shows in another only as a ghost or a lifted arrow, which looks the same before the
     plan, so each view gets its own pair;
   - the change list of step 2 as a table: element, change (added, changed, removed), node id.

   Done when the plan holds one pair of links per view that shows a mark, and one table row per
   line of the change list.

## Marks

Each mark is seen three ways: its colour in every view, its phase in the stepper's before view,
and its open point in the panel and the header's list.

**The palette.** In the draft's `atlas.config.ts`, add three keys to `palette`:

```ts
"plan-added": { light: "#0a8f5a", dark: "#34d399" },
"plan-changed": { light: "#c2187a", dark: "#f472b6" },
"plan-removed": { light: "#b42318", dark: "#f87171" },
```

**The phases.** A map without `phases` gets `phases: ["before", "after"]` (`["avant", "après"]`
for a map in French): the stepper then reads all, before, after, and before is the map before the
plan. A map with phases gets the after word as its last phase, and its own last phase is the
before phase. The after phase is the plan's.

**Added.** A new node takes `color: "plan-added"` and the after phase, and sits in the container
it belongs to. A new link takes the after phase. A file the plan creates goes in `kicker` or `src`
as plain text: `check` verifies every `<cite>` against the repository, where that file is still
missing.

**Changed.** The node takes `color: "plan-changed"`. Edit the fields the plan changes (`lead`,
`io`, `sub`, the labels of its links), so the draft reads as the map after the plan, and add an
open point to the node that keeps what the edit replaced: `open: [{ id: "plan-<node id>-<change>",
text: "Before: … After: …" }]` (`Avant : … Après : …` in French), one sentence each side. A
changed link gets that open point on its `from` node, which takes the colour too. The text
describes states: the map's `stepWords` refuse the words of a step.

**Removed.** A leaf the plan removes takes `color: "plan-removed"`, `kind: "off"` (drawn dashed)
and an open point saying what replaces it, or that nothing does. A link it removes gets
`kind: "dash"` and an open point on its `from` node. A container it removes takes the colour and
an open point, and each of its leaves `kind: "off"`.

Every open point the plan map adds has an id starting with `plan-`: with the three palette keys and
the after phase, they are the plan's marks.

## End of a plan

The user drops the plan: once they have run `/atlas:stop`, run
`cli.ts draft <map folder> <name> --drop`. A plan carried out keeps its draft as the map to reach;
before `cli.ts draft <map folder> <name> --adopt` brings it into the map, its marks come out and
the map is checked against the repository.
