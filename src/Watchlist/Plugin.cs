using System;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Common.Plugins;
using MediaBrowser.Model.Serialization;

namespace Jellyfin.Plugin.Watchlist;

public class Plugin : BasePlugin<PluginConfiguration>
{
    public Plugin(IApplicationPaths applicationPaths, IXmlSerializer xmlSerializer)
        : base(applicationPaths, xmlSerializer)
    {
        Instance = this;
    }

    public override string Name => "Watchlist";

    public override string Description => "Lista personal «para ver» por usuario: botón en la ficha de películas y series y entrada «Mi lista» en el menú del usuario.";

    public override Guid Id => Guid.Parse("351f939b-307a-44c6-a027-3b23fa1596a3");

    public static Plugin? Instance { get; private set; }
}
