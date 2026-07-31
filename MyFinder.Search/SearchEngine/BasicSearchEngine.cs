using System.Globalization;
using System.Text.RegularExpressions;
using Microsoft.Data.Sqlite;
using MyFinder.Core.Interfaces;
using MyFinder.Core.Interfaces.Repositories;
using MyFinder.Models.Entities;

namespace MyFinder.Search.SearchEngine;

public class BasicSearchEngine : ISearchEngine
{
    private readonly IDatabaseContext _databaseContext;
    private readonly ISecurityAuditLogger? _logger;

    public BasicSearchEngine(IDatabaseContext databaseContext, ISecurityAuditLogger? logger = null)
    {
        _databaseContext = databaseContext ?? throw new ArgumentNullException(nameof(databaseContext));
        _logger = logger;
    }

    public async Task<IEnumerable<FileRecord>> SearchFilesAsync(string queryText, int limit = 100)
    {
        if (string.IsNullOrWhiteSpace(queryText))
            return Enumerable.Empty<FileRecord>();

        var trimmedQuery = queryText.Trim();

        var ftsQuery = BuildFtsQuery(trimmedQuery);
        List<FileRecord> results = new();

        if (!string.IsNullOrEmpty(ftsQuery))
        {
            results = await FtsSearchInternalAsync(ftsQuery, limit);
        }

        if (results.Count == 0 || HasChineseCharacters(trimmedQuery))
        {
            var likeResults = await LikeSearchAsync(trimmedQuery, limit);
            var mergedDict = new Dictionary<long, FileRecord>();

            foreach (var r in results)
                mergedDict[r.Id] = r;
            foreach (var r in likeResults)
                mergedDict[r.Id] = r;

            results = mergedDict.Values.OrderByDescending(f => f.UpdatedTime).Take(limit).ToList();
        }

        return results;
    }

    public async Task<IEnumerable<FileRecord>> LikeSearchAsync(string queryText, int limit = 100)
    {
        if (string.IsNullOrWhiteSpace(queryText))
            return Enumerable.Empty<FileRecord>();

        var trimmedQuery = queryText.Trim();
        var keywords = trimmedQuery.Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries)
                                   .Distinct()
                                   .ToList();

        if (keywords.Count == 0)
            return Enumerable.Empty<FileRecord>();

        var results = new List<FileRecord>();

        try
        {
            using var connection = await _databaseContext.OpenConnectionAsync();

            var conditions = new List<string>();
            using var command = connection.CreateCommand();

            for (int i = 0; i < keywords.Count; i++)
            {
                var paramName = $"@kw{i}";
                conditions.Add($"(FileName LIKE {paramName} OR Path LIKE {paramName})");
                command.Parameters.AddWithValue(paramName, $"%{keywords[i]}%");
            }

            var sql = $@"
                SELECT Id, Path, FileName, Extension, SizeBytes, Category, CreatedTime, UpdatedTime
                FROM Files
                WHERE {string.Join(" AND ", conditions)}
                ORDER BY UpdatedTime DESC
                LIMIT @Limit;
            ";

            command.CommandText = sql;
            command.Parameters.AddWithValue("@Limit", limit);

            using var reader = await command.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                results.Add(MapReaderToFileRecord(reader));
            }
        }
        catch (Exception ex)
        {
            _logger?.LogError("ERR_LIKE_SEARCH", ex.Message);
        }

        return results;
    }

    private async Task<List<FileRecord>> FtsSearchInternalAsync(string ftsQuery, int limit)
    {
        var results = new List<FileRecord>();
        try
        {
            using var connection = await _databaseContext.OpenConnectionAsync();
            using var command = connection.CreateCommand();
            command.CommandText = @"
                SELECT f.Id, f.Path, f.FileName, f.Extension, f.SizeBytes, f.Category, f.CreatedTime, f.UpdatedTime
                FROM Files f
                JOIN FilesFTS ft ON f.Id = ft.rowid
                WHERE FilesFTS MATCH @Query
                ORDER BY rank
                LIMIT @Limit;
            ";

            command.Parameters.AddWithValue("@Query", ftsQuery);
            command.Parameters.AddWithValue("@Limit", limit);

            using var reader = await command.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                results.Add(MapReaderToFileRecord(reader));
            }
        }
        catch (Exception ex)
        {
            _logger?.LogError("ERR_FTS_SEARCH", ex.Message);
        }

        return results;
    }

    private static bool HasChineseCharacters(string text)
    {
        return Regex.IsMatch(text, @"[\u4e00-\u9fff]");
    }

    private static string BuildFtsQuery(string queryText)
    {
        if (string.IsNullOrWhiteSpace(queryText))
            return string.Empty;

        var sanitized = Regex.Replace(queryText, @"[^a-zA-Z0-9\u4e00-\u9fff\s]", " ");
        var parts = sanitized.Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);

        var processedParts = new List<string>();
        foreach (var part in parts)
        {
            if (part.Length <= 1)
            {
                processedParts.Add(part);
            }
            else if (HasChineseCharacters(part))
            {
                processedParts.Add(part);
            }
            else
            {
                processedParts.Add(part + "*");
            }
        }

        return string.Join(" ", processedParts);
    }

    private static FileRecord MapReaderToFileRecord(SqliteDataReader reader)
    {
        return new FileRecord
        {
            Id = reader.GetInt64(0),
            Path = reader.GetString(1),
            FileName = reader.GetString(2),
            Extension = reader.GetString(3),
            SizeBytes = reader.GetInt64(4),
            Category = reader.GetInt32(5),
            CreatedTime = DateTime.Parse(reader.GetString(6), CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind),
            UpdatedTime = DateTime.Parse(reader.GetString(7), CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind)
        };
    }
}