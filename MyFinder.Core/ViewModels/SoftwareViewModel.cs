using System.Collections.ObjectModel;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using MyFinder.Core.Interfaces;
using MyFinder.Core.Interfaces.Repositories;
using MyFinder.Models.Entities;

namespace MyFinder.Core.ViewModels;

public partial class SoftwareViewModel : BaseViewModel
{
    private readonly ISoftwareScanner _softwareScanner;
    private readonly ISoftwareRepository _softwareRepository;

    [ObservableProperty]
    private SoftwareRecord? _selectedSoftware;

    public ObservableCollection<SoftwareRecord> SoftwareList { get; } = new();

    public SoftwareViewModel(ISoftwareScanner softwareScanner, ISoftwareRepository softwareRepository)
    {
        _softwareScanner = softwareScanner ?? throw new ArgumentNullException(nameof(softwareScanner));
        _softwareRepository = softwareRepository ?? throw new ArgumentNullException(nameof(softwareRepository));

        Title = "我的软件";
    }

    public override async Task InitializeAsync()
    {
        if (IsInitialized) return;

        await LoadSoftwareFromDbAsync();
        await base.InitializeAsync();
    }

    private async Task LoadSoftwareFromDbAsync()
    {
        IsLoading = true;
        ClearError();

        try
        {
            var items = await _softwareRepository.GetAllAsync();
            SoftwareList.Clear();
            foreach (var item in items)
            {
                SoftwareList.Add(item);
            }

            if (SoftwareList.Count == 0)
            {
                await RefreshSoftwareAsync();
            }
        }
        catch (Exception ex)
        {
            SetError($"加载软件列表失败: {ex.Message}");
        }
        finally
        {
            IsLoading = false;
        }
    }

    [RelayCommand]
    private async Task RefreshSoftwareAsync()
    {
        IsLoading = true;
        ClearError();

        try
        {
            var scanned = await _softwareScanner.ScanInstalledSoftwareAsync();
            var list = scanned.ToList();
            
            SoftwareList.Clear();

            if (list.Any())
            {
                await _softwareRepository.AddRangeAsync(list);
                foreach (var item in list)
                {
                    SoftwareList.Add(item);
                }
            }
        }
        catch (Exception ex)
        {
            SetError($"扫描已安装软件失败: {ex.Message}");
        }
        finally
        {
            IsLoading = false;
        }
    }
}