using MyFinder.Models.Entities;

namespace MyFinder.Core.Interfaces;

public interface ISearchEngine
{
    Task<IEnumerable<FileRecord>> SearchFilesAsync(string queryText, int limit = 100);
    Task<IEnumerable<FileRecord>> LikeSearchAsync(string queryText, int limit = 100);
}
