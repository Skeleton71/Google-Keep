import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Note } from './note';
import { Task } from './task';
import { TaskService } from './task.service';

@Component({
  imports: [CommonModule, FormsModule],
  selector: 'app-root',
  templateUrl: './app.html',
  standalone: true,
})
export class App implements OnInit {
  private readonly storageKey = 'notes-app.notes';
  private readonly noteColors = ['#eef4d8', '#e4f0f2', '#f9e9df', '#eee8f5', '#e4eee4'];

  readonly notes = signal<Note[]>(this.loadNotes());
  readonly tasks = signal<Task[]>([]);
  readonly today = new Date();
  draftTitle = '';
  draftContent = '';
  taskTitle = '';
  taskDescription = '';
  editingTaskId: string | null = null;
  tasksLoading = true;
  taskSaving = false;
  deletingTaskId: string | null = null;
  searchQuery = '';
  statusMessage = '';
  taskMessage = '';

  constructor(private readonly taskService: TaskService) {}

  ngOnInit(): void {
    void this.loadTasks();
  }

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

  async saveTask(): Promise<void> {
    const title = this.taskTitle.trim();
    const description = this.taskDescription.trim();
    if (!title || this.taskSaving) return;

    this.taskSaving = true;
    this.taskMessage = '';
    try {
      if (this.editingTaskId) {
        const existingTask = this.tasks().find((task) => task.id === this.editingTaskId);
        if (!existingTask) {
          this.cancelTaskEdit();
          return;
        }
        const updatedTask = await this.taskService.updateTask({
          ...existingTask,
          title,
          description,
        });
        this.tasks.update((tasks) =>
          tasks.map((task) => (task.id === updatedTask.id ? updatedTask : task)),
        );
        this.taskMessage = 'Task updated.';
      } else {
        const task = await this.taskService.addTask({
          title,
          description,
          completed: false,
          createdAt: new Date().toISOString(),
        });
        this.tasks.update((tasks) => [task, ...tasks]);
        this.taskMessage = 'Task added.';
      }
      this.cancelTaskEdit();
    } catch (error) {
      this.taskMessage = this.getErrorMessage(error);
    } finally {
      this.taskSaving = false;
    }
  }

  editTask(task: Task): void {
    this.editingTaskId = task.id;
    this.taskTitle = task.title;
    this.taskDescription = task.description;
    this.taskMessage = '';
  }

  cancelTaskEdit(): void {
    this.editingTaskId = null;
    this.taskTitle = '';
    this.taskDescription = '';
  }

  async toggleTask(task: Task): Promise<void> {
    this.taskMessage = '';
    try {
      const updatedTask = await this.taskService.updateTask({
        ...task,
        completed: !task.completed,
      });
      this.tasks.update((tasks) =>
        tasks.map((item) => (item.id === updatedTask.id ? updatedTask : item)),
      );
    } catch (error) {
      this.taskMessage = this.getErrorMessage(error);
    }
  }

  async deleteTask(task: Task): Promise<void> {
    this.deletingTaskId = task.id;
    this.taskMessage = '';
    try {
      await this.taskService.deleteTask(task.id);
      this.tasks.update((tasks) => tasks.filter((item) => item.id !== task.id));
      if (this.editingTaskId === task.id) this.cancelTaskEdit();
      this.taskMessage = 'Task deleted.';
    } catch (error) {
      this.taskMessage = this.getErrorMessage(error);
    } finally {
      this.deletingTaskId = null;
    }
  }

  private async loadTasks(): Promise<void> {
    this.tasksLoading = true;
    try {
      const tasks = await this.taskService.getTasks();
      this.tasks.set(
        tasks.sort((first, second) => second.createdAt.localeCompare(first.createdAt)),
      );
      this.taskMessage = '';
    } catch (error) {
      this.taskMessage = this.getErrorMessage(error);
    } finally {
      this.tasksLoading = false;
    }
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error && !(error instanceof HttpErrorResponse)) {
      return error.message;
    }
    if (error instanceof HttpErrorResponse) {
      const firebaseError = error.error?.error ?? error.error;
      const firebaseMessage = firebaseError?.message;
      const firebaseStatus = firebaseError?.status;
      if (firebaseStatus === 'PERMISSION_DENIED') {
        return 'Firebase denied access. Check that Anonymous sign-in is enabled and Firestore rules allow each user to access their own tasks.';
      }
      if (typeof firebaseMessage === 'string') {
        if (firebaseMessage.includes('PERMISSION_DENIED')) {
          return 'Firebase denied access. Check that Anonymous sign-in is enabled and Firestore rules allow each user to access their own tasks.';
        }
        if (firebaseMessage.includes('OPERATION_NOT_ALLOWED')) {
          return 'Enable Anonymous sign-in in Firebase Authentication to use the task list.';
        }
        return `Firebase error (${error.status}): ${firebaseMessage}`;
      }
      return `Could not connect to Firebase (${error.status}). Check your connection and Firebase settings.`;
    }
    return 'Something went wrong while saving tasks.';
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
