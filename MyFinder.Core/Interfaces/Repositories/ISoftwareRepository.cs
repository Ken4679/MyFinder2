using MyFinder.Models.Entities;

namespace MyFinder.Core.Interfaces.Repositories;

public interface ISoftwareRepository
{
    Task<long> AddAsync(SoftwareRecord software);
    Task AddRangeAsync(IEnumerable<SoftwareRecord> softwareList);
    Task<SoftwareRecord?> GetByIdAsync(long id);
    Task<IEnumerable<SoftwareRecord>> GetAllAsync();
    Task<bool> DeleteAsync(long id);
}
