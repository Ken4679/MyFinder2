using MyFinder.Models.Entities;

namespace MyFinder.Core.Interfaces.Repositories;

public interface ISearchHistoryRepository
{
    Task<long> AddAsync(SearchHistoryRecord history);
    Task<IEnumerable<SearchHistoryRecord>> GetRecentAsync(int count = 20);
    Task<bool> ClearAllAsync();
}
