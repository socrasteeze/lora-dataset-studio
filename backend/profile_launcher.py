"""Profile picker for the source installation. No application imports."""
import argparse
import os
from pathlib import Path
import subprocess
import sys
import webbrowser

from instance_profiles import FileLease, ProfileError, ProfileStore


def launch(store, ident):
    # The backend repeats this check while holding the OS lease before imports.
    with FileLease(store.home / 'active.lock'):
        store.check_other_work(ident)
    environment = store.child_environment(ident)
    script = 'run.py' if environment.get('LDS_SUPERVISE') == '0' else 'supervise.py'
    return subprocess.Popen(
        [sys.executable, str(Path(__file__).with_name(script))],
        cwd=str(store.root), env=environment,
        creationflags=subprocess.CREATE_NEW_CONSOLE if os.name == 'nt' else 0)


def show_picker(store):
    import tkinter as tk
    from tkinter import messagebox, simpledialog, ttk

    window = tk.Tk()
    window.title('Studio Profiles')
    window.geometry('440x300')
    window.minsize(360, 260)
    frame = ttk.Frame(window, padding=16)
    frame.pack(fill='both', expand=True)
    ttk.Label(frame, text='Profiles', font=('', 15, 'bold')).pack(anchor='w')
    ttk.Label(frame, text='Finish work and close the server before switching.',
              wraplength=390).pack(anchor='w', pady=(4, 12))
    choices = tk.Listbox(frame, exportselection=False, height=6)
    choices.pack(fill='both', expand=True)
    status = tk.StringVar(value='Ready')
    ttk.Label(frame, textvariable=status, wraplength=390).pack(anchor='w', pady=8)
    rows = []
    processes = []

    def refresh():
        rows[:] = store.profiles()
        choices.delete(0, 'end')
        for row in rows:
            choices.insert('end', row['name'])
        choices.selection_set(0)

    def selected():
        indexes = choices.curselection()
        return rows[indexes[0]] if indexes else None

    class CreateDialog(simpledialog.Dialog):
        def body(self, master):
            ttk.Label(master, text='Name').pack(anchor='w')
            self.name = ttk.Entry(master, width=36)
            self.name.pack(fill='x', pady=6)
            return self.name

        def buttonbox(self):
            box = ttk.Frame(self)
            ttk.Button(box, text='Create', command=self.ok).pack(side='left', padx=5)
            ttk.Button(box, text='Cancel', command=self.cancel).pack(side='left', padx=5)
            box.pack(pady=8)
            self.bind('<Return>', self.ok)
            self.bind('<Escape>', self.cancel)

        def validate(self):
            try:
                self.result = store.create(self.name.get())
                return True
            except (ProfileError, OSError) as exc:
                messagebox.showerror('Create Profile', str(exc), parent=self)
                return False

    def create():
        row = CreateDialog(window, title='Create Profile').result
        if row is None:
            return
        try:
            refresh()
            choices.selection_clear(0, 'end')
            choices.selection_set(next(i for i, item in enumerate(rows) if item['id'] == row['id']))
            status.set('Created. Settings and files start empty.')
        except (ProfileError, OSError) as exc:
            messagebox.showerror('Create Profile', str(exc), parent=window)

    def open_profile():
        row = selected()
        if row is None:
            return
        if any(process.poll() is None for process in processes):
            messagebox.showinfo('Open Profile', 'Close the active Studio server before opening a profile.', parent=window)
            return
        try:
            processes.append(launch(store, row['id']))
            status.set('Studio is starting in its server window.')
        except (ProfileError, OSError) as exc:
            messagebox.showerror('Open Profile', str(exc), parent=window)

    def open_browser():
        row = selected()
        if row is not None:
            try:
                webbrowser.open(store.browser_url(row['id']))
            except ProfileError as exc:
                messagebox.showerror('Open Browser', str(exc), parent=window)

    buttons = ttk.Frame(frame)
    buttons.pack(fill='x')
    for text, command in (('Create Profile', create), ('Open Profile', open_profile),
                          ('Open Browser', open_browser)):
        ttk.Button(buttons, text=text, command=command).pack(side='left', fill='x', expand=True, padx=2)
    try:
        refresh()
    except ProfileError as exc:
        messagebox.showerror('Profiles', str(exc), parent=window)
        window.destroy()
        return
    # Closing this picker never terminates a server or a training child.
    window.mainloop()


def main():
    parser = argparse.ArgumentParser(description='Select an isolated Studio profile.')
    parser.add_argument('--profile', help='Open a profile by its stable ID.')
    parser.add_argument('--create', metavar='NAME', help='Create an empty profile.')
    parser.add_argument('--list', action='store_true', help='List profiles locally.')
    args = parser.parse_args()
    store = ProfileStore()
    try:
        if args.create:
            store.create(args.create)
        elif args.list:
            for row in store.profiles():
                print(f"{row['id']}  {row['name']}")
        elif args.profile:
            process = launch(store, args.profile)
            return process.wait()
        else:
            show_picker(store)
    except (ProfileError, OSError, ImportError) as exc:
        print(str(exc), file=sys.stderr)
        if isinstance(exc, ImportError):
            print('The picker needs Tk. Use --list, --create NAME or --profile ID from a terminal.', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
