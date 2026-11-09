import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { firebaseConfig } from './firebase.config';
import { Task } from './task';

interface FirebaseAuthResponse {
  localId: string;
  idToken: string;
  refreshToken: string;
  expiresIn: string;
}

interface FirebaseRefreshResponse {
  user_id: string;
  id_token: string;
  refresh_token: string;
  expires_in: string;
}

interface FirestoreDocument {
  name: string;
  fields?: {
    title?: { stringValue?: string };
    description?: { stringValue?: string };
    completed?: { booleanValue?: boolean };
    createdAt?: { stringValue?: string };
  };
}

interface FirestoreListResponse {
  documents?: FirestoreDocument[];
}

interface AuthSession {
  userId: string;
  idToken: string;
  expiresAt: number;
}

@Injectable({ providedIn: 'root' })
export class TaskService {
  private readonly refreshTokenKey = `task-app.firebase-refresh-token.${firebaseConfig.projectId}`;
  private authSession?: AuthSession;

  constructor(private readonly http: HttpClient) {}

  async getTasks(): Promise<Task[]> {
    const url = await this.collectionUrl();
    const response = await firstValueFrom(
      this.http.get<FirestoreListResponse>(url, { headers: await this.authHeaders() }),
    );
    return (response.documents ?? []).map((document) => this.toTask(document));
  }

  async addTask(task: Omit<Task, 'id'>): Promise<Task> {
    const url = await this.collectionUrl();
    const document = await firstValueFrom(
      this.http.post<FirestoreDocument>(
        url,
        { fields: this.toFirestoreFields(task) },
        { headers: await this.authHeaders() },
      ),
    );
    return this.toTask(document);
  }

  async updateTask(task: Task): Promise<Task> {
    const url = `${await this.collectionUrl()}/${encodeURIComponent(task.id)}`;
    const params = new HttpParams()
      .append('updateMask.fieldPaths', 'title')
      .append('updateMask.fieldPaths', 'description')
      .append('updateMask.fieldPaths', 'completed');
    const document = await firstValueFrom(
      this.http.patch<FirestoreDocument>(
        url,
        {
          fields: {
            title: { stringValue: task.title },
            description: { stringValue: task.description },
            completed: { booleanValue: task.completed },
          },
        },
        { headers: await this.authHeaders(), params },
      ),
    );
    return this.toTask(document);
  }

  async deleteTask(id: string): Promise<void> {
    const url = `${await this.collectionUrl()}/${encodeURIComponent(id)}`;
    await firstValueFrom(this.http.delete<void>(url, { headers: await this.authHeaders() }));
  }

  private async collectionUrl(): Promise<string> {
    this.validateConfig();
    const { userId } = await this.getAuthSession();
    return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(firebaseConfig.projectId)}/databases/(default)/documents/users/${encodeURIComponent(userId)}/tasks`;
  }

  private async authHeaders(): Promise<HttpHeaders> {
    const { idToken } = await this.getAuthSession();
    return new HttpHeaders({ Authorization: `Bearer ${idToken}` });
  }

  private async getAuthSession(): Promise<AuthSession> {
    if (this.authSession && this.authSession.expiresAt > Date.now() + 30_000) {
      return this.authSession;
    }

    const refreshToken = localStorage.getItem(this.refreshTokenKey);
    if (refreshToken) {
      const response = await firstValueFrom(
        this.http.post<FirebaseRefreshResponse>(
          `https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(firebaseConfig.apiKey)}`,
          new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
          }).toString(),
          { headers: new HttpHeaders({ 'Content-Type': 'application/x-www-form-urlencoded' }) },
        ),
      );
      localStorage.setItem(this.refreshTokenKey, response.refresh_token);
      this.authSession = {
        userId: response.user_id,
        idToken: response.id_token,
        expiresAt: Date.now() + Number(response.expires_in) * 1000,
      };
      return this.authSession;
    }

    const response = await firstValueFrom(
      this.http.post<FirebaseAuthResponse>(
        `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(firebaseConfig.apiKey)}`,
        { returnSecureToken: true },
      ),
    );
    localStorage.setItem(this.refreshTokenKey, response.refreshToken);
    this.authSession = {
      userId: response.localId,
      idToken: response.idToken,
      expiresAt: Date.now() + Number(response.expiresIn) * 1000,
    };
    return this.authSession;
  }

  private toFirestoreFields(task: Omit<Task, 'id'>): NonNullable<FirestoreDocument['fields']> {
    return {
      title: { stringValue: task.title },
      description: { stringValue: task.description },
      completed: { booleanValue: task.completed },
      createdAt: { stringValue: task.createdAt },
    };
  }

  private toTask(document: FirestoreDocument): Task {
    const id = document.name.split('/').pop();
    const fields = document.fields;
    const title = fields?.title?.stringValue;
    const description = fields?.description?.stringValue;
    const completed = fields?.completed?.booleanValue;
    const createdAt = fields?.createdAt?.stringValue;

    if (
      !id ||
      typeof title !== 'string' ||
      typeof description !== 'string' ||
      typeof completed !== 'boolean' ||
      typeof createdAt !== 'string'
    ) {
      throw new Error('Firebase returned a task with missing or invalid fields.');
    }

    return { id, title, description, completed, createdAt };
  }

  private validateConfig(): void {
    if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
      throw new Error('Add your Firebase API key and project ID in src/app/firebase.config.ts.');
    }
  }
}
