import { App } from 'obsidian';
import { TodoItem } from '../types';
import { AddTaskModal } from '../components/modals/addTaskModal';
import { DeleteTaskModal, DeleteAllCompletedTasksModal } from '../components/modals/confirmModals';

export class TaskManager {
    private todoItems: TodoItem[] = [];

    // Task operation callbacks
    public onTaskComplete: (item: TodoItem) => Promise<void> = () => Promise.resolve();
    public onTaskUncomplete: (item: TodoItem) => Promise<void> = () => Promise.resolve();
    public onTaskUpdate: (item: TodoItem, taskLine: string) => Promise<void> = () => Promise.resolve();
    public onTaskDelete: (item: TodoItem) => Promise<void> = () => Promise.resolve();
    public onTaskAdd: (taskLine: string) => Promise<void> = () => Promise.resolve();
    public onMoveFromArchived: (item: TodoItem) => Promise<void> = () => Promise.resolve();

    constructor(private app: App) { }

    // Store todo items
    setTodoItems(items: TodoItem[]): void {
        this.todoItems = items;
    }

    // Mark task as done
    async completeTask(item: TodoItem): Promise<void> {
        await this.onTaskComplete(item);
    }

    // Unmark task completion
    async uncompleteTask(item: TodoItem): Promise<void> {
        await this.onTaskUncomplete(item);
    }

    // Move task to inbox
    async moveTaskFromArchived(item: TodoItem): Promise<void> {
        await this.onMoveFromArchived(item);
    }

    // Open task edit modal
    editTask(item: TodoItem, availableProjects: string[], availableContexts: string[]): void {
        const modal = new AddTaskModal(
            this.app,
            (taskLine: string) => {
                void this.onTaskUpdate(item, taskLine);
            },
            availableProjects,
            availableContexts,
            item,
            () => {
                // Show delete confirmation
                const confirmModal = new DeleteTaskModal(
                    this.app,
                    item.description,
                    async () => {
                        await this.onTaskDelete(item);
                    }
                );
                confirmModal.open();
            }
        );
        modal.open();
    }

    // Open new task modal
    openAddTaskModal(
        availableProjects: string[],
        availableContexts: string[],
        defaultProject?: string,
        defaultDueDate?: string
    ): void {
        const modal = new AddTaskModal(
            this.app,
            (taskLine: string) => {
                void this.onTaskAdd(taskLine);
            },
            availableProjects,
            availableContexts,
            undefined,
            undefined,
            defaultProject,
            defaultDueDate
        );
        modal.open();
    }

    // Open bulk delete modal
    public openEmptyCompletedTasksModal(): void {
        const completedTasks = this.todoItems.filter(item => item.completed);
        const count = completedTasks.length;

        if (count === 0) {
            return;
        }

        const modal = new DeleteAllCompletedTasksModal(
            this.app,
            count,
            async () => {
                await this.deleteAllCompletedTasks();
            }
        );
        modal.open();
    }

    // Delete all completed tasks
    private async deleteAllCompletedTasks(): Promise<void> {
        const completedTasks = this.todoItems.filter(item => item.completed);

        for (const task of completedTasks) {
            if (this.onTaskDelete) {
                await this.onTaskDelete(task);
            }
        }
    }
}