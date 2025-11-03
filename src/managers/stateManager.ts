import { TFile } from 'obsidian';
import { TodoTxtView } from '../view';

export class StateManager {
    // Restore view state from saved data
    async loadState(state: unknown, view: TodoTxtView): Promise<void> {
        // Type guard to safely access state properties
        if (!state || typeof state !== 'object') {
            await view.loadDefaultFile();
            return;
        }

        const stateObj = state as Record<string, unknown>;
        const filterManager = view.getFilterManager();
        const projectManager = view.getProjectManager();

        // Restore filter settings
        filterManager.setState({
            sortOption: (typeof stateObj.sortOption === 'string' ? stateObj.sortOption : 'priority'),
            searchQuery: (typeof stateObj.searchQuery === 'string' ? stateObj.searchQuery : ''),
            contextFilter: (typeof stateObj.contextFilter === 'string' ? stateObj.contextFilter : ''),
            selectedProject: (typeof stateObj.selectedProject === 'string' ? stateObj.selectedProject : ''),
            selectedTimeFilter: (typeof stateObj.selectedTimeFilter === 'string' ? stateObj.selectedTimeFilter : ''),
            archivedFilter: (typeof stateObj.archivedFilter === 'boolean' ? stateObj.archivedFilter : false),
            completedFilter: (typeof stateObj.completedFilter === 'boolean' ? stateObj.completedFilter : false)
        });

        // Restore pinned projects
        if (Array.isArray(stateObj.pinnedProjects)) {
            projectManager.pinnedProjects = [...stateObj.pinnedProjects];
        }

        // Load file or default
        if (typeof stateObj.file === 'string') {
            const file = view.app.vault.getAbstractFileByPath(stateObj.file);
            if (file instanceof TFile) {
                await view.leaf.openFile(file);
            } else {
                await view.loadDefaultFile();
            }
        } else {
            await view.loadDefaultFile();
        }
    }

    // Save current view state
    saveState(view: TodoTxtView): Record<string, unknown> {
        const file = view.getFile();
        const filterState = view.getFilterManager().getState();
        const pinnedProjects = [...view.getProjectManager().pinnedProjects];

        return {
            file: file?.path || null,
            ...filterState,
            pinnedProjects
        };
    }
}