using System.IO;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Data;

namespace MyFinder.UI.Converters;

public class FileExistsToVisibilityConverter : IValueConverter
{
    public object Convert(object value, Type targetType, object parameter, string language)
    {
        bool exists = value is string path && !string.IsNullOrEmpty(path) && File.Exists(path);
        bool reverse = parameter is string s && s.Equals("Reverse", StringComparison.OrdinalIgnoreCase);
        return (exists ^ reverse) ? Visibility.Visible : Visibility.Collapsed;
    }

    public object ConvertBack(object value, Type targetType, object parameter, string language)
    {
        throw new NotImplementedException();
    }
}
