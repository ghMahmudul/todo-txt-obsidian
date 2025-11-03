import { App, Plugin, TFile, WorkspaceLeaf } from 'obsidian';
import { TodoTxtSettings, DEFAULT_SETTINGS, VIEW_TYPE_TODO_TXT } from './types';
import { TodoTxtSettingTab } from './settings';
import { TodoTxtView } from './view';
import { AddTaskModal } from './components/modals/addTaskModal';
import { TaskOperations } from './utils/taskOperations';
import { FileOperations } from './utils/fileOperations';

export default class TodoTxtPlugin extends Plugin {
    settings: TodoTxtSettings;
    private taskOps: TaskOperations;
    private fileOps: FileOperations;

    async onload(): Promise<void> {
        // Load settings or defaults
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

        // Initialize utilities
        this.taskOps = new TaskOperations(this.app, this.settings);
        this.fileOps = new FileOperations(this.app);

        // Register todo view type
        this.registerView(VIEW_TYPE_TODO_TXT, (leaf) => new TodoTxtView(leaf, this));
        // Auto-open .txt files as todo
        this.registerExtensions(['txt'], VIEW_TYPE_TODO_TXT);

        // Handle file renames
        this.registerEvent(
            this.app.vault.on('rename', async (file, oldPath) => {
                if (file instanceof TFile && file.extension === 'txt') {
                    await this.handleFileRename(file, oldPath);
                }
            })
        );

        // Add ribbon icon
        this.addRibbonIcon('circle-check-big', 'Open task', () => {
            this.activateView();
        });

        // Open todo command
        this.addCommand({
            id: 'open-task',
            name: 'Open task',
            callback: () => this.activateView()
        });

        // Add task command
        this.addCommand({
            id: 'add-task',
            name: 'Add task',
            callback: () => {
                // Use existing view or create new modal
                const activeLeaf = this.app.workspace.getActiveViewOfType(TodoTxtView);
                if (activeLeaf && activeLeaf instanceof TodoTxtView) {
                    activeLeaf.openAddTaskModal();
                } else {
                    this.openAddTaskModal();
                }
            }
        });

        // Add project command
        this.addCommand({
            id: 'add-project',
            name: 'Add project',
            callback: () => {
                const activeView = this.app.workspace.getActiveViewOfType(TodoTxtView);
                if (activeView) {
                    activeView.openAddProjectModal();
                }
            }
        });

        // Create file command
        this.addCommand({
            id: 'create-new-file',
            name: 'Create new file',
            callback: async () => {
                const todoPath = this.settings.todoFilePath;
                const folder = todoPath.substring(0, todoPath.lastIndexOf('/'));
                const fileName = todoPath.substring(todoPath.lastIndexOf('/') + 1);
                const baseName = fileName.replace('.txt', '');

                if (!this.app.vault.getAbstractFileByPath(todoPath)) {
                    const newFile = await this.app.vault.create(todoPath, '');
                    await this.openTodoTxtView(newFile as TFile);
                    return;
                }

                let counter = 1;
                let newPath = `${folder}/${baseName} ${counter}.txt`;

                while (this.app.vault.getAbstractFileByPath(newPath)) {
                    counter++;
                    newPath = `${folder}/${baseName} ${counter}.txt`;
                }

                const newFile = await this.app.vault.create(newPath, '');
                await this.openTodoTxtView(newFile as TFile);
            }
        });

        // Auto-open on startup
        if (this.settings.openOnStartup) {
            window.setTimeout(() => {
                this.activateView();
            }, 1000);
        }

        this.addSettingTab(new TodoTxtSettingTab(this.app, this));
    }

    async saveSettings(): Promise<void> {
        await this.saveData(this.settings);
    }

    // Update settings on file rename
    private async handleFileRename(file: TFile, oldPath: string): Promise<void> {
        let dataUpdated = false;

        // Update pinned projects
        if (this.settings.pinnedProjects && this.settings.pinnedProjects[oldPath]) {
            this.settings.pinnedProjects[file.path] = this.settings.pinnedProjects[oldPath];
            delete this.settings.pinnedProjects[oldPath];
            dataUpdated = true;
        }

        // Update project icons
        if (this.settings.projectIcons && this.settings.projectIcons[oldPath]) {
            this.settings.projectIcons[file.path] = this.settings.projectIcons[oldPath];
            delete this.settings.projectIcons[oldPath];
            dataUpdated = true;
        }

        // Update known projects
        if (this.settings.allKnownProjects && this.settings.allKnownProjects[oldPath]) {
            this.settings.allKnownProjects[file.path] = this.settings.allKnownProjects[oldPath];
            delete this.settings.allKnownProjects[oldPath];
            dataUpdated = true;
        }

        if (dataUpdated) {
            await this.saveSettings();

            // Refresh open views
            const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_TODO_TXT);
            for (const leaf of leaves) {
                if (leaf.view instanceof TodoTxtView) {
                    const view = leaf.view;
                    if (view.getFile()?.path === file.path) {
                        view.getProjectManager().loadPinnedProjects(file);
                        view.getProjectManager().loadAllKnownProjects(file);
                        view.getProjectManager().loadProjectIcons(file);
                        await view.loadFileContent();
                    }
                }
            }
        }
    }

    // Open task modal for default file
    private async openAddTaskModal(): Promise<void> {
        const defaultFile = await this.getDefaultTodoFile();
        const availableProjects = await this.taskOps.getAvailableProjectsFromFile(defaultFile);
        const availableContexts = await this.taskOps.getAvailableContextsFromFile(defaultFile);

        const modal = new AddTaskModal(this.app, async (taskLine: string) => {
            await this.addTaskToDefaultFile(taskLine);
        }, availableProjects, availableContexts);
        modal.open();
    }

    // Add task to default file
    private async addTaskToDefaultFile(taskLine: string): Promise<void> {
        const defaultFile = await this.getDefaultTodoFile();
        const currentContent = await this.app.vault.read(defaultFile);
        const newContent = currentContent ? `${taskLine}\n${currentContent}` : taskLine;
        await this.app.vault.process(defaultFile, (data) => {
            return newContent;
        });

        // Extract and save new projects from task
        const projects = this.taskOps.extractProjectsFromLine(taskLine);
        if (projects.length > 0) {
            // Initialize settings if needed
            if (!this.settings.allKnownProjects) {
                this.settings.allKnownProjects = {};
            }
            if (!this.settings.allKnownProjects[defaultFile.path]) {
                this.settings.allKnownProjects[defaultFile.path] = [];
            }

            // Add new projects
            let projectsAdded = false;
            projects.forEach(project => {
                if (!this.settings.allKnownProjects![defaultFile.path].includes(project) &&
                    project !== 'Inbox' && project !== 'Archived') {
                    this.settings.allKnownProjects![defaultFile.path].push(project);
                    projectsAdded = true;
                }
            });

            // Save if projects were added
            if (projectsAdded) {
                await this.saveSettings();
            }

            const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_TODO_TXT);
            for (const leaf of leaves) {
                if (leaf.view instanceof TodoTxtView) {
                    const view = leaf.view;
                    if (view.getFile()?.path === defaultFile.path) {
                        const projectManager = view.getProjectManager();
                        // Add new projects to project manager
                        projects.forEach(project => {
                            if (!projectManager.allKnownProjects.includes(project) &&
                                project !== 'Inbox' && project !== 'Archived') {
                                projectManager.allKnownProjects.push(project);
                            }
                        });
                        break;
                    }
                }
            }
        }
    }

    // Open todo view for file
    async openTodoTxtView(file: TFile): Promise<void> {
        const leaf = this.app.workspace.getLeaf(true);
        await leaf.setViewState({
            type: VIEW_TYPE_TODO_TXT,
            state: { file: file.path },
            active: true
        });
    }

    // Get or create default file
    async getDefaultTodoFile(): Promise<TFile> {
        return this.fileOps.getDefaultTodoFile(this.settings.todoFilePath);
    }

    // Open or focus default view
    async activateView(): Promise<void> {
        const { workspace } = this.app;
        const defaultFile = await this.getDefaultTodoFile();
        const defaultFilePath = defaultFile.path;

        let leaf: WorkspaceLeaf | null = null;
        const leaves = workspace.getLeavesOfType(VIEW_TYPE_TODO_TXT);

        // Check if view already exists for this file
        for (const existingLeaf of leaves) {
            const state = existingLeaf.getViewState();
            if (state.type === VIEW_TYPE_TODO_TXT && state.state?.file === defaultFilePath) {
                leaf = existingLeaf;
                break;
            }
        }

        if (leaf) {
            // View exists, just reveal and focus it
            workspace.revealLeaf(leaf);
        } else {
            // Create new view
            leaf = workspace.getLeaf(true);
            const startupState = this.taskOps.getStartupState(this.settings.startupFilter);
            await leaf.setViewState({
                type: VIEW_TYPE_TODO_TXT,
                state: { file: defaultFilePath, ...startupState },
                active: true
            });
        }

        // Apply startup filter after a brief delay
        if (leaf.view instanceof TodoTxtView) {
            const view = leaf.view;
            window.setTimeout(() => {
                view.setFilter(this.settings.startupFilter);
            }, 100);
        }
    }
}