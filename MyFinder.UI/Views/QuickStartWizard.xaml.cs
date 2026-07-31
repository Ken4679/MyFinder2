using System;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using MyFinder.Core.Interfaces;
using MyFinder.Core.ViewModels;

namespace MyFinder.UI.Views;

public sealed partial class QuickStartWizard : ContentDialog
{
    private readonly IFileScanner _fileScanner;
    private readonly SettingsViewModel _settingsVM;
    private readonly IFolderPickerService _folderPicker;

    public Visibility CustomPathBoxVisibility => PathOptions.SelectedIndex == 2 ? Visibility.Visible : Visibility.Collapsed;

    public QuickStartWizard(IFileScanner fileScanner, SettingsViewModel settingsVM, IFolderPickerService folderPicker)
    {
        InitializeComponent();
        _fileScanner = fileScanner;
        _settingsVM = settingsVM;
        _folderPicker = folderPicker;

        PathOptions.SelectionChanged += (s, e) =>
        {
            Bindings.Update();
            if (PathOptions.SelectedIndex != 2)
                CustomPathBox.Text = string.Empty;
        };
    }

    private async void OnBrowseCustomPathClick(object sender, RoutedEventArgs e)
    {
        if (_folderPicker != null && App.CurrentWindow != null)
        {
            var path = await _folderPicker.PickFolderAsync(App.CurrentWindow);
            if (!string.IsNullOrEmpty(path))
            {
                CustomPathBox.Text = path;
            }
        }
    }

    private async void OnStartIndexClick(ContentDialog sender, ContentDialogButtonClickEventArgs args)
    {
        var deferral = args.GetDeferral();
        try
        {
            string selectedPath;
            switch (PathOptions.SelectedIndex)
            {
                case 0: selectedPath = Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments); break;
                case 1: selectedPath = Environment.GetFolderPath(Environment.SpecialFolder.Desktop); break;
                case 2:
                    if (string.IsNullOrWhiteSpace(CustomPathBox.Text))
                    {
                        args.Cancel = true;
                        return;
                    }
                    selectedPath = CustomPathBox.Text;
                    break;
                default: return;
            }

            await _settingsVM.StartIndexingOnPath(selectedPath);
        }
        catch
        {
            // 异常安全保护
        }
        finally
        {
            deferral.Complete();
        }
    }
}
