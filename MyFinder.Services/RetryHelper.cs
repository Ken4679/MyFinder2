using MyFinder.Core.Interfaces;

namespace MyFinder.Services;

public static class RetryHelper
{
    public static async Task<T> RetryAsync<T>(
        Func<Task<T>> action,
        int maxRetries = 3,
        TimeSpan? initialDelay = null,
        ISecurityAuditLogger? logger = null)
    {
        initialDelay ??= TimeSpan.FromMilliseconds(100);
        int attempt = 0;

        while (true)
        {
            try
            {
                return await action();
            }
            catch (Exception ex) when (attempt < maxRetries)
            {
                attempt++;
                var delay = TimeSpan.FromMilliseconds(initialDelay.Value.TotalMilliseconds * Math.Pow(2, attempt - 1));
                logger?.LogError($"RETRY_{attempt}", $"Retry {attempt}/{maxRetries} after {delay.TotalMilliseconds}ms: {ex.Message}");
                await Task.Delay(delay);
            }
        }
    }

    public static async Task RetryAsync(
        Func<Task> action,
        int maxRetries = 3,
        TimeSpan? initialDelay = null,
        ISecurityAuditLogger? logger = null)
    {
        await RetryAsync(async () =>
        {
            await action();
            return true;
        }, maxRetries, initialDelay, logger);
    }
}
