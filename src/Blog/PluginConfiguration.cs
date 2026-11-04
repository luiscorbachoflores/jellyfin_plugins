using MediaBrowser.Model.Plugins;

namespace Jellyfin.Plugin.Blog;

public class PluginConfiguration : BasePluginConfiguration
{
    public string Title { get; set; } = Api.BlogDefaults.Title;

    public string Description { get; set; } = Api.BlogDefaults.Description;

    /// <summary>Añade la entrada «Blog» a menuLinks de /web/config.json.</summary>
    public bool ShowInMenu { get; set; } = true;
}
