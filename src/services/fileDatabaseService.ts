import { FileCategory, FileRecord, NaturalLanguageQueryResult, TreeNodeModel } from '../types';
import { determineCategory } from './storageService';
import { tauriBridge } from './tauriBridge';

export class FileDatabaseService {
  private files: FileRecord[] = [];
  private onFilesChangedListeners: (() => void)[] = [];

  constructor(initialFiles: FileRecord[]) {
    this.files = [...initialFiles];
  }

  public getFiles(): FileRecord[] {
    return [...this.files];
  }

  public setFiles(newFiles: FileRecord[]): void {
    this.files = [...newFiles];
    this.notifyChange();
  }

  public subscribe(listener: () => void): () => void {
    this.onFilesChangedListeners.push(listener);
    return () => {
      this.onFilesChangedListeners = this.onFilesChangedListeners.filter(l => l !== listener);
    };
  }

  private notifyChange(): void {
    this.onFilesChangedListeners.forEach(l => l());
  }

  public addFile(file: FileRecord): void {
    const existingIndex = this.files.findIndex(f => f.path.toLowerCase() === file.path.toLowerCase());
    if (existingIndex >= 0) {
      this.files[existingIndex] = file;
    } else {
      this.files.unshift(file);
    }
    this.notifyChange();
  }

  public deleteFile(id: string): void {
    this.files = this.files.filter(f => f.id !== id);
    this.notifyChange();
  }

  public deleteFilesByDirectory(dirPath: string): number {
    const normalized = dirPath.trim().toLowerCase();
    const countBefore = this.files.length;
    this.files = this.files.filter(f => {
      const fPath = f.path.toLowerCase();
      return !fPath.startsWith(normalized + '\\') && fPath !== normalized;
    });
    const removedCount = countBefore - this.files.length;
    if (removedCount > 0) {
      this.notifyChange();
    }
    return removedCount;
  }

  // Real SQLite Async Search through Tauri IPC
  public async searchFilesAsync(
    queryText: string,
    isDeepSearch: boolean = false,
    nlResult?: NaturalLanguageQueryResult,
    isAiMode: boolean = true
  ): Promise<FileRecord[]> {
    if (tauriBridge.isTauri()) {
      try {
        let searchKeywords = queryText.trim();
        let targetCategory: number | undefined = undefined;
        let startDate: string | undefined = undefined;
        let endDate: string | undefined = undefined;

        if (isAiMode && nlResult && nlResult.isNaturalLanguage) {
          if (nlResult.extractedSearchText) {
            searchKeywords = nlResult.extractedSearchText.trim();
          }
          if (nlResult.targetCategory !== undefined) {
            targetCategory = nlResult.targetCategory as number;
          }
          if (nlResult.startDate) startDate = nlResult.startDate;
          if (nlResult.endDate) endDate = nlResult.endDate;
        }

        const results = await tauriBridge.searchFiles({
          query: searchKeywords,
          category: targetCategory,
          startDate,
          endDate,
          isDeepSearch,
          limit: 300,
        });
        return results;
      } catch (err) {
        console.warn('Native SQLite search failed, falling back to local cache', err);
      }
    }

    return this.searchFiles(queryText, isDeepSearch, nlResult, isAiMode);
  }

  // FTS5 and LIKE Search implementation (matching C# BasicSearchEngine)
  public searchFiles(
    queryText: string,
    isDeepSearch: boolean = false,
    nlResult?: NaturalLanguageQueryResult,
    isAiMode: boolean = true
  ): FileRecord[] {
    if (!queryText.trim() && (!nlResult || !nlResult.isNaturalLanguage)) {
      return [];
    }

    let searchKeywords: string[] = [];
    let targetCategory: FileCategory | undefined = undefined;
    let startDate: Date | undefined = undefined;
    let endDate: Date | undefined = undefined;

    if (isAiMode && nlResult && nlResult.isNaturalLanguage) {
      if (nlResult.extractedSearchText) {
        searchKeywords = nlResult.extractedSearchText
          .split(/\s+/)
          .map(k => k.trim().toLowerCase())
          .filter(Boolean);
      }
      targetCategory = nlResult.targetCategory;
      if (nlResult.startDate) startDate = new Date(nlResult.startDate);
      if (nlResult.endDate) endDate = new Date(nlResult.endDate);
    } else {
      searchKeywords = queryText
        .trim()
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean);
    }

    return this.files.filter(file => {
      // 1. Category Filter
      if (targetCategory !== undefined && file.category !== targetCategory) {
        return false;
      }

      // 2. Date Filter
      if (startDate || endDate) {
        const fileDate = new Date(file.updatedTime);
        if (startDate && fileDate < startDate) return false;
        if (endDate && fileDate > endDate) return false;
      }

      // 3. Keyword Match
      if (searchKeywords.length === 0) {
        return true;
      }

      const fileNameLower = file.fileName.toLowerCase();
      const pathLower = file.path.toLowerCase();
      const snippetLower = (file.contentSnippet || '').toLowerCase();
      const extLower = file.extension.toLowerCase();

      if (isDeepSearch) {
        // Fuzzy / Substring match in all fields
        return searchKeywords.every(kw => 
          fileNameLower.includes(kw) ||
          pathLower.includes(kw) ||
          snippetLower.includes(kw) ||
          extLower.includes(kw)
        );
      } else {
        // Fast exact substring or prefix match
        return searchKeywords.every(kw =>
          fileNameLower.includes(kw) ||
          pathLower.includes(kw) ||
          extLower.includes(kw) ||
          snippetLower.includes(kw)
        );
      }
    }).sort((a, b) => new Date(b.updatedTime).getTime() - new Date(a.updatedTime).getTime());
  }

  // Build Directory Tree from watched directories & indexed files
  public buildDirectoryTree(watchedPaths: string[]): TreeNodeModel[] {
    const rootNodes: TreeNodeModel[] = [];

    // Group files by watched path
    for (const watchedPath of watchedPaths) {
      const rootNode: TreeNodeModel = {
        id: `tree-root-${watchedPath}`,
        name: watchedPath.split('\\').pop() || watchedPath,
        fullPath: watchedPath,
        isDirectory: true,
        isExpanded: true,
        isLoaded: true,
        children: [],
      };

      // Collect all files belonging to this watched path
      const matchingFiles = this.files.filter(f => 
        f.path.toLowerCase().startsWith(watchedPath.toLowerCase())
      );

      // Build hierarchical folder/file tree
      const dirMap = new Map<string, TreeNodeModel>();
      dirMap.set(watchedPath.toLowerCase(), rootNode);

      for (const file of matchingFiles) {
        const relative = file.path.substring(watchedPath.length).replace(/^\\/, '');
        const segments = relative.split('\\');
        let currentPath = watchedPath;
        let parentNode = rootNode;

        // Traverse subdirectories
        for (let i = 0; i < segments.length - 1; i++) {
          const segName = segments[i];
          currentPath = `${currentPath}\\${segName}`;
          const currentPathLower = currentPath.toLowerCase();

          let dirNode = dirMap.get(currentPathLower);
          if (!dirNode) {
            dirNode = {
              id: `dir-${currentPath}`,
              name: segName,
              fullPath: currentPath,
              isDirectory: true,
              isExpanded: false,
              isLoaded: true,
              children: [],
            };
            dirMap.set(currentPathLower, dirNode);
            if (!parentNode.children) parentNode.children = [];
            parentNode.children.push(dirNode);
          }
          parentNode = dirNode;
        }

        // Add file node
        const fileNode: TreeNodeModel = {
          id: file.id,
          name: file.fileName,
          fullPath: file.path,
          isDirectory: false,
          category: file.category,
          sizeBytes: file.sizeBytes,
          updatedTime: file.updatedTime,
        };
        if (!parentNode.children) parentNode.children = [];
        // Avoid duplicates
        if (!parentNode.children.some(c => c.fullPath === file.path)) {
          parentNode.children.push(fileNode);
        }
      }

      // Sort children: directories first, then alphabetical
      const sortChildren = (node: TreeNodeModel) => {
        if (!node.children) return;
        node.children.sort((a, b) => {
          if (a.isDirectory && !b.isDirectory) return -1;
          if (!a.isDirectory && b.isDirectory) return 1;
          return a.name.localeCompare(b.name, 'zh-CN');
        });
        node.children.forEach(sortChildren);
      };

      sortChildren(rootNode);
      rootNodes.push(rootNode);
    }

    return rootNodes;
  }
}
