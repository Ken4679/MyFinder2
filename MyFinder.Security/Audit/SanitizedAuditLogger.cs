using System.Text;
using System.Text.RegularExpressions;
using MyFinder.Core.Interfaces;

namespace MyFinder.Security.Audit;

public class SanitizedAuditLogger : ISecurityAuditLogger
{
    private readonly string _logFilePath;
    private readonly object _lock = new();
    private const int MaxLogFileSizeBytes = 5 * 1024 * 1024;
    private readonly IPathProvider _pathProvider;
    private bool _disablePathSanitization = false;

    public SanitizedAuditLogger(IPathProvider pathProvider)
    {
        _pathProvider = pathProvider ?? throw new ArgumentNullException(nameof(pathProvider));
        
        try
        {
            var logDir = _pathProvider.GetLogDirectory();
            Directory.CreateDirectory(logDir);
            _logFilePath = Path.Combine(logDir, $"audit_{DateTime.Now:yyyyMMdd}.log");
        }
        catch
        {
            var fallbackDir = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "Logs");
            Directory.CreateDirectory(fallbackDir);
            _logFilePath = Path.Combine(fallbackDir, $"emergency_audit_{DateTime.Now:yyyyMMdd}.log");
        }

        RotateLogIfNeeded();
        CleanOldLogs();
        WriteLine("[SESSION_START] SanitizedAuditLogger initialized successfully.");
    }

    private void CleanOldLogs()
    {
        try
        {
            var logDir = Path.GetDirectoryName(_logFilePath);
            if (string.IsNullOrEmpty(logDir) || !Directory.Exists(logDir))
                return;

            var files = Directory.GetFiles(logDir, "audit_*.log");
            var cutoff = DateTime.Now.AddDays(-30);
            foreach (var file in files)
            {
                try
                {
                    if (File.GetCreationTime(file) < cutoff)
                        File.Delete(file);
                }
                catch { }
            }
        }
        catch { }
    }

    private void RotateLogIfNeeded()
    {
        try
        {
            if (File.Exists(_logFilePath) && new FileInfo(_logFilePath).Length > MaxLogFileSizeBytes)
            {
                var archive = _logFilePath.Replace(".log", $"_{DateTime.Now:HHmmss}.log");
                File.Move(_logFilePath, archive);
            }
        }
        catch { }
    }

    private void WriteLine(string line)
    {
        var timestamped = $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss.fff}] {line}";
        System.Diagnostics.Debug.WriteLine(timestamped);

        lock (_lock)
        {
            try
            {
                RotateLogIfNeeded();
                File.AppendAllText(_logFilePath, timestamped + Environment.NewLine, Encoding.UTF8);
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"[EMERGENCY_LOG_FAIL] {ex.Message}");
            }
        }
    }

    private static string MaskSensitiveInfo(string input)
    {
        if (string.IsNullOrEmpty(input)) return input;

        var phonePattern = new Regex(@"\b1[3-9]\d{9}\b", RegexOptions.Compiled);
        var masked = phonePattern.Replace(input, m => $"{m.Value[..3]}****{m.Value[^4..]}");

        var idPattern = new Regex(@"\b\d{17}[\dXx]\b", RegexOptions.Compiled);
        masked = idPattern.Replace(masked, m => $"{m.Value[..6]}********{m.Value[^4..]}");

        var emailPattern = new Regex(@"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b", RegexOptions.Compiled);
        masked = emailPattern.Replace(masked, m =>
        {
            var parts = m.Value.Split('@');
            return $"{parts[0][..Math.Min(3, parts[0].Length)]}***@{parts[1]}";
        });

        return masked;
    }

    private string SanitizePath(string path)
    {
        if (string.IsNullOrEmpty(path)) return path;
        if (_disablePathSanitization) return path;

        try
        {
            if (path.Length < 10) return path;

            string root = Path.GetPathRoot(path)?.TrimEnd(Path.DirectorySeparatorChar) ?? string.Empty;
            string fileName = Path.GetFileName(path);

            if (string.IsNullOrEmpty(root) && string.IsNullOrEmpty(fileName))
                return "[invalid_path]";

            var parts = path.Split(Path.DirectorySeparatorChar, StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length == 0) return "[invalid_path]";

            int userIndex = -1;
            for (int i = 0; i < parts.Length - 1; i++)
            {
                if (string.Equals(parts[i], "Users", StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(parts[i], "User", StringComparison.OrdinalIgnoreCase))
                {
                    userIndex = i;
                    break;
                }
            }

            if (userIndex >= 0 && userIndex + 1 < parts.Length)
            {
                parts[userIndex + 1] = "[USER]";
            }

            string sanitized = string.Join(Path.DirectorySeparatorChar.ToString(), parts);

            if (sanitized.Length > 20)
            {
                if (parts.Length >= 3)
                {
                    string drive = parts[0];
                    string last = parts[^1];
                    sanitized = $"{drive}\\[...]\\{last}";
                }
            }

            if (!string.IsNullOrEmpty(fileName))
            {
                var maskedFileName = MaskSensitiveInfo(fileName);
                if (maskedFileName != fileName && sanitized.Contains(fileName))
                {
                    sanitized = sanitized.Replace(fileName, maskedFileName);
                }
            }

            return sanitized;
        }
        catch
        {
            return "[invalid_path]";
        }
    }

    public void LogError(string errorCode, string safeDescription)
    {
        WriteLine($"[ERROR] [{errorCode}] {SanitizePath(safeDescription)}");
    }

    public void LogSecurityEvent(string eventCode, string safeDetails)
    {
        WriteLine($"[SECURITY] [{eventCode}] {SanitizePath(safeDetails)}");
    }

    public void LogUserAction(string actionCode)
    {
        WriteLine($"[ACTION] [{actionCode}]");
    }
}