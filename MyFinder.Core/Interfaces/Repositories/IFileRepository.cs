using MyFinder.Models.Entities;

namespace MyFinder.Core.Interfaces.Repositories;

public interface IFileRepository
{
    Task<long> AddAsync(FileRecord file);
    Task AddRangeAsync(IEnumerable<FileRecord> files);
    Task<FileRecord?> GetByIdAsync(long id);
    Task<FileRecord?> GetByPathAsync(string path);
    Task<IEnumerable<FileRecord>> GetAllAsync(int limit = 100);
    Task<int> GetTotalCountAsync();
    Task<bool> DeleteAsync(long id);
    Task<bool> DeleteByPathAsync(string path);
    Task<bool> UpdateAsync(FileRecord file);
}