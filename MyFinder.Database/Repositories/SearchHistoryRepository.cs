using System.Globalization;
using Microsoft.Data.Sqlite;
using MyFinder.Core.Exceptions;
using MyFinder.Core.Interfaces;
using MyFinder.Core.Interfaces.Repositories;
using MyFinder.Models.Entities;

namespace MyFinder.Database.Repositories;

public class SearchHistoryRepository : ISearchHistoryRepository
{
    private readonly IDatabaseContext _databaseContext;

    public SearchHistoryRepository(IDatabaseContext databaseContext)
    {
        _databaseContext = databaseContext ?? throw new ArgumentNullException(nameof(databaseContext));
    }

    public async Task<long> AddAsync(SearchHistoryRecord history)
    {
        try
        {
            using var connection = await _databaseContext.OpenConnectionAsync();

            using var command = connection.CreateCommand();
            command.CommandText = @"
                INSERT INTO SearchHistory (QueryText, SearchType, CreatedTime, UpdatedTime)
                VALUES (@QueryText, @SearchType, @CreatedTime, @UpdatedTime);
                SELECT last_insert_rowid();
            ";

            command.Parameters.AddWithValue("@QueryText", history.QueryText);
            command.Parameters.AddWithValue("@SearchType", history.SearchType);
            command.Parameters.AddWithValue("@CreatedTime", history.CreatedTime.ToString("o", CultureInfo.InvariantCulture));
            command.Parameters.AddWithValue("@UpdatedTime", history.UpdatedTime.ToString("o", CultureInfo.InvariantCulture));

            var result = await command.ExecuteScalarAsync();
            return result is long id ? id : 0;
        }
        catch (SqliteException ex)
        {
            throw new DataStoreException("SQLite error", "保存搜索记录失败", ex);
        }
    }

    public async Task<IEnumerable<SearchHistoryRecord>> GetRecentAsync(int count = 20)
    {
        var list = new List<SearchHistoryRecord>();
        try
        {
            using var connection = await _databaseContext.OpenConnectionAsync();

            using var command = connection.CreateCommand();
            command.CommandText = "SELECT Id, QueryText, SearchType, CreatedTime, UpdatedTime FROM SearchHistory ORDER BY Id DESC LIMIT @Limit;";
            command.Parameters.AddWithValue("@Limit", count);

            using var reader = await command.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                list.Add(new SearchHistoryRecord
                {
                    Id = reader.GetInt64(0),
                    QueryText = reader.GetString(1),
                    SearchType = reader.GetString(2),
                    CreatedTime = DateTime.Parse(reader.GetString(3), CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind),
                    UpdatedTime = DateTime.Parse(reader.GetString(4), CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind)
                });
            }
        }
        catch (SqliteException ex)
        {
            throw new DataStoreException("SQLite error", "读取搜索记录失败", ex);
        }

        return list;
    }

    public async Task<bool> ClearAllAsync()
    {
        try
        {
            using var connection = await _databaseContext.OpenConnectionAsync();

            using var command = connection.CreateCommand();
            command.CommandText = "DELETE FROM SearchHistory;";

            var rows = await command.ExecuteNonQueryAsync();
            return rows > 0;
        }
        catch (SqliteException ex)
        {
            throw new DataStoreException("SQLite error", "清空搜索记录失败", ex);
        }
    }
}
