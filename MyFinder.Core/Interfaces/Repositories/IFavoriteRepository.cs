using MyFinder.Models.Entities;

namespace MyFinder.Core.Interfaces.Repositories;

public interface IFavoriteRepository
{
    Task<long> AddAsync(FavoriteRecord favorite);
    Task<IEnumerable<FavoriteRecord>> GetAllAsync();
    Task<bool> DeleteAsync(long id);
    Task<bool> ExistsAsync(string targetPath);
}
