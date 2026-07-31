using Microsoft.Data.Sqlite;
using MyFinder.Core.Interfaces;
using MyFinder.Models;

namespace MyFinder.Services.Startup;

public class StartupPipeline
{
    private readonly IDatabaseContext _databaseContext;
    private readonly IDatabaseInitializer _databaseInitializer;
    private readonly IThemeService _themeService;
    private readonly ISecurityAuditLogger _auditLogger;

    public StartupPipeline(
        IDatabaseContext databaseContext,
        IDatabaseInitializer databaseInitializer,
        IThemeService themeService,
        ISecurityAuditLogger auditLogger)
    {
        _databaseContext = databaseContext ?? throw new ArgumentNullException(nameof(databaseContext));
        _databaseInitializer = databaseInitializer ?? throw new ArgumentNullException(nameof(databaseInitializer));
        _themeService = themeService ?? throw new ArgumentNullException(nameof(themeService));
        _auditLogger = auditLogger ?? throw new ArgumentNullException(nameof(auditLogger));
    }

    public async Task<StartupResult> RunAsync()
    {
        try
        {
            _themeService.InitializeTheme();
            _auditLogger.LogSecurityEvent("STARTUP", $"Using database: {_databaseContext.DbPath}");

            var dbSuccess = await _databaseContext.InitializeDatabaseAsync();
            if (!dbSuccess)
            {
                _auditLogger.LogError("ERR_DB_INIT", "Database foundation connection failed.");
                return StartupResult.Failure("ERR_DB_INIT", "数据库存储引擎初始化失败。");
            }

            var schemaSuccess = await _databaseInitializer.InitializeSchemaAsync();
            if (!schemaSuccess)
            {
                _auditLogger.LogError("ERR_SCHEMA_INIT", "Database schema validation/creation failed.");
                return StartupResult.Failure("ERR_SCHEMA_INIT", "数据库架构校验初始化失败。");
            }

            _ = Task.Run(async () =>
            {
                try
                {
                    using var conn = await _databaseContext.OpenConnectionAsync();
                    using var cmd = conn.CreateCommand();
                    cmd.CommandText = "SELECT 1 FROM FilesFTS LIMIT 1;";
                    await cmd.ExecuteScalarAsync();
                }
                catch { }
            });

            _auditLogger.LogSecurityEvent("STARTUP_OK", "All systems ready.");
            return StartupResult.Success();
        }
        catch (Exception ex)
        {
            _auditLogger.LogError("ERR_STARTUP_CRITICAL", $"Critical error: {ex.Message}");
            return StartupResult.Failure("ERR_STARTUP_CRITICAL", "应用初始化异常，程序降级运行。");
        }
    }
}