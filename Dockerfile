# Usar la imagen oficial de SQL Server
FROM mcr.microsoft.com/mssql/server:2022-latest

# Configuración de variables de entorno
ENV SA_PASSWORD=TuPassword123
ENV ACCEPT_EULA=Y
ENV MSSQL_PID=Express

# Exponer el puerto 1433 para SQL Server
EXPOSE 1433

# Comando para iniciar SQL Server
CMD ["/opt/mssql/bin/sqlservr"]
