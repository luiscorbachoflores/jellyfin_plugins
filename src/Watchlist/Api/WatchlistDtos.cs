using System.Collections.Generic;

namespace Jellyfin.Plugin.Watchlist.Api;

public record WatchlistItemDto(string ItemId, string Name, string Type, int? ProductionYear, bool HasPrimaryImage, string AddedUtc);

public record ItemStatusDto(bool Eligible, bool InWatchlist);

/// <summary>Vista de solo lectura para el administrador: la lista de cada usuario, tal cual
/// está guardada (sin comprobar visibilidad de biblioteca, que depende de cada usuario).</summary>
public record AdminWatchlistItemDto(string ItemId, string Name, string Type, int? ProductionYear, bool HasPrimaryImage, string AddedUtc);

public record AdminUserWatchlistDto(string UserId, string UserName, IReadOnlyList<AdminWatchlistItemDto> Items);
