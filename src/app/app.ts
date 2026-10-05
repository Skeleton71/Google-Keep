import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Note } from './note';

@Component({
  imports: [CommonModule, FormsModule],
  selector: 'app-root',
  templateUrl: './app.html',
  standalone: true,
})
export class App {
  private readonly storageKey = 'notes-app.notes';
  private readonly noteColors = ['#eef4d8', '#e4f0f2', '#f9e9df', '#eee8f5', '#e4eee4'];

  readonly notes = signal<Note[]>(this.loadNotes());
  readonly today = new Date();
  draftTitle = '';
  draftContent = '';
  searchQuery = '';
  statusMessage = '';

  get visibleNotes(): Note[] {
    const query = this.searchQuery.trim().toLocaleLowerCase();
    const notes = this.notes();
    return query
      ? notes.filter((note) => `${note.title} ${note.content}`.toLocaleLowerCase().includes(query))
      : notes;
  }

  addNote(): void {
    const title = this.draftTitle.trim();
    const content = this.draftContent.trim();
    if (!title && !content) return;

    const note: Note = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      title: title || 'Untitled note',
      content,
      createdAt: new Date().toISOString(),
      color: this.noteColors[this.notes().length % this.noteColors.length],
    };

    this.persistNotes([note, ...this.notes()]);
    this.draftTitle = '';
    this.draftContent = '';
    this.statusMessage = 'Note added and saved.';
  }

  deleteNote(id: string): void {
    this.persistNotes(this.notes().filter((note) => note.id !== id));
    this.statusMessage = 'Note deleted.';
  }

  private loadNotes(): Note[] {
    try {
      const storedNotes: unknown = JSON.parse(localStorage.getItem(this.storageKey) ?? '[]');
      return Array.isArray(storedNotes) ? storedNotes.filter((note): note is Note => this.isNote(note)) : [];
    } catch {
      return [];
    }
  }

  private isNote(value: unknown): value is Note {
    if (typeof value !== 'object' || value === null) return false;
    const note = value as Partial<Note>;
    return (
      typeof note.id === 'string' &&
      typeof note.title === 'string' &&
      typeof note.content === 'string' &&
      typeof note.createdAt === 'string' &&
      typeof note.color === 'string'
    );
  }

  private persistNotes(notes: Note[]): void {
    this.notes.set(notes);
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(notes));
    } catch {
      this.statusMessage = 'Changes are visible.';
    }
  }
}
