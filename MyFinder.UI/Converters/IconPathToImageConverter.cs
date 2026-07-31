using System.Collections.Concurrent;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using Microsoft.UI.Xaml.Data;
using Microsoft.UI.Xaml.Media.Imaging;
using Windows.Storage.Streams;

namespace MyFinder.UI.Converters;

public class IconPathToImageConverter : IValueConverter
{
    private static readonly ConcurrentDictionary<string, BitmapImage> _cache = new();
    private static readonly object _cacheLock = new();
    private const int MaxCacheSize = 50;

    public object? Convert(object value, Type targetType, object parameter, string language)
    {
        if (value is not string path || string.IsNullOrEmpty(path) || !File.Exists(path))
            return null;

        if (_cache.TryGetValue(path, out var cachedImage))
            return cachedImage;

        try
        {
            using var icon = Icon.ExtractAssociatedIcon(path);
            if (icon == null) return null;

            using var bitmap = icon.ToBitmap();
            using var ms = new MemoryStream();
            bitmap.Save(ms, ImageFormat.Png);
            ms.Position = 0;

            var image = new BitmapImage();
            image.SetSource(ms.AsRandomAccessStream());

            lock (_cacheLock)
            {
                if (_cache.Count >= MaxCacheSize)
                    _cache.Clear();
                _cache[path] = image;
            }

            return image;
        }
        catch
        {
            return null;
        }
    }

    public object ConvertBack(object value, Type targetType, object parameter, string language)
    {
        throw new NotImplementedException();
    }
}