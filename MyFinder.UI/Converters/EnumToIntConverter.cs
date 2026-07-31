using Microsoft.UI.Xaml.Data;

namespace MyFinder.UI.Converters;

public class EnumToIntConverter : IValueConverter
{
    public object Convert(object value, Type targetType, object parameter, string language)
    {
        if (value is Enum e)
        {
            return System.Convert.ToInt32(e);
        }
        return 0;
    }

    public object ConvertBack(object value, Type targetType, object parameter, string language)
    {
        if (value is int intValue && targetType.IsEnum)
        {
            return Enum.ToObject(targetType, intValue);
        }
        return 0;
    }
}
