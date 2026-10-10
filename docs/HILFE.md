# KEPTA from the terminal

One local file, no account. This page is the paper twin of the board
`kepta --help` prints in a terminal. `tests/kli-hilfe-doku.test.ts` keeps the
two in step: a command or switch named on one side and unknown on the other
fails the suite. Nothing here is a promise the code does not keep.

## write

```text
kepta remember "<text>" [#tag]     store a sentence — KEPTA picks type and tags
kepta import chatgpt <folder>      your ChatGPT export, turned into notes
```

## read

```text
kepta recall "<question>"          what the memory says, best matches first
kepta timeline "<topic>"           the same topic in order of time, oldest first
kepta contradict                  duplicates and contradictions, nothing changed
kepta stats                        the file: notes, types, graph, and its state
kepta demo                         a six-act story on a throwaway database
```

## set up

```text
kepta setup                        connect KEPTA to the AI apps on this computer
kepta ui                           where to look at your notes
```

## switches

```text
--json                 machine output: one object from stats, recall,
                       timeline or contradict
--limit N              how many to list (recall 5, timeline 30, contradict 20)
--no-color             never write escape sequences
--color=always         write them even into a pipe
-h  --help             this board        -V  --version   name and version
```

`--` ends the switches: anything after it is text, even a word that starts with
a dash. A word that starts with a dash before `--` is a switch, never a
command — an unknown switch is refused as a switch and is never corrected into a
command.

## exit codes

```text
0      the command worked
1      it failed — stderr carries three lines: what, why, and next
2      unknown command or unknown switch
130    interrupted (Ctrl+C); the demo deletes its throwaway file first
```

## environment

```text
KEPTA_DATA_DIR        where the file lives (default: ~/.kepta)
KEPTA_DB_KEY          64 hexadecimal characters; without one the OS keychain
KEPTA_ENCRYPTION=off  say it on purpose and the file stays plaintext
NO_COLOR  TERM=dumb   no escape sequences; the words still carry the state
```

## what an answer looks like

Measured, not imagined — this is `kepta stats` on a file with three notes, at
80 columns:

```text
KEPTA memory
    file    ~/.kepta/kepta.db
    notes   3 active · 0 in trash
    types   semantic: 3
    graph   3 nodes · 0 links
    tags    #remember (3) · #billing (1) · #weber (1)
    state   encrypted · key: KEPTA_DB_KEY
    wrote   2026-10-10 18:14 (just now)
    next: kepta contradict — does your memory hold anything twice?
```

The grammar of every answer: a heading that names its number, a body indented
two spaces, a trace in grey saying where a line came from, and a last line that
is a way — never a compliment. Details use 2, a continuation uses 4. `·` only
separates, it never marks. A state word (`encrypted`, `NOT encrypted`) is only
printed when this very run measured it.

## reading it as a machine

`--json` gives one compact object on stdout with the same numbers, no colour and
no `next:` line. `kepta recall "weber" --json | head -1` is safe: an early
closing pipe is a reader who unsubscribed, not an error — the command prints its
answer and leaves with exit 0.
