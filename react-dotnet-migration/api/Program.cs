var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();

// Configure YARP Reverse Proxy
builder.Services.AddReverseProxy()
    .LoadFromConfig(builder.Configuration.GetSection("ReverseProxy"));

var app = builder.Build();

app.UseRouting();
app.MapControllers();
app.MapReverseProxy(); // Enable YARP routing

app.Run();
